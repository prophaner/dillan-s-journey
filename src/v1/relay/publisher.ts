// The relay's side of hr_ingest (h10-design 2, 3 HealthPublisher, 5.3 "Batching and rate"):
//  - server clock: server_time() three times (median) before Connect is enabled, then refined from
//    every response (median of the last 5). Samples queued before the offset was known are stamped
//    with the first known offset before they are sent.
//  - outbox: up to 120 samples (2 min) tagged with the user they were read for; discarded on any
//    user change; flushed oldest first with their original measured_at, at most 30 per call.
//  - rate: one call in flight, at least 340 ms apart (≤ 3 calls/s, the server limit); normally one
//    call per second with 1–2 samples, an immediate call on every mode change, and a heartbeat
//    every 5 s (30 s after 10 min idle or in standby).
//  - retries: a failed call keeps its samples and backs off 1, 2, 4, 8, 15 s.
// The publisher knows nothing about sessions or zones; the backend decides what to store.

import { medianOffset, offsetSample } from "@/v1/core/freshness";
import {
  RELAY_HEARTBEAT_MS,
  RELAY_IDLE_BACKOFF_AFTER_MS,
  RELAY_IDLE_HEARTBEAT_MS,
  type HrIngestRequest,
  type HrIngestResponse,
  type ParsedHr,
  type RelayMode,
  type SensorInfo,
  type SourceKind,
} from "@/v1/core/hr";
import { HrAuthError, newId } from "@/v1/data/api";

export const OUTBOX_MAX = 120;
export const BATCH_MAX = 30;
export const MIN_CALL_GAP_MS = 340;
export const SAMPLE_FLUSH_MS = 1_000;
export const RETRY_MAX_MS = 15_000;
const TICK_MS = 100;

export interface PublisherApi {
  ingest(req: HrIngestRequest): Promise<HrIngestResponse>;
  serverTime(): Promise<number>;
  ingestKeepalive?(req: HrIngestRequest): void;
}

/** What the relay controller reports on every call. */
export interface PublishState {
  mode: RelayMode;
  kind: SourceKind;
  /** local time of the current startNotifications (null when not connected) */
  connectedAtLocal: number | null;
  sensor: SensorInfo | null;
  /** local time the relay entered idle/standby, or null while active */
  restingSinceLocal: number | null;
  sourceName: string;
  platform: string;
}

export interface PublisherEvents {
  onResponse(res: HrIngestResponse, sent: { mode: RelayMode; claim: boolean }): void;
  onAuthError(): void;
  /** false while calls fail (the relay shows "Offline - holding {k}s of readings") */
  onNetwork(ok: boolean): void;
}

interface Queued {
  seq: number;
  localMs: number;
  /** offset known when the sample was read; null = stamp with the first known offset */
  offset: number | null;
  bpm: number | null;
  contact: boolean | null;
}

export class IngestPublisher {
  streamId: string = newId();
  private userId: string | null = null;
  private seq = 0;
  private outbox: Queued[] = [];
  private offsets: number[] = [];
  private offset = 0;
  private known = false;
  private inFlight = false;
  private lastCallAt = Number.NEGATIVE_INFINITY;
  private urgent = false;
  private claim = false;
  private retryAt = 0;
  private failures = 0;
  private paused = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private now: () => number;

  constructor(
    private api: PublisherApi,
    public sourceId: string,
    private state: () => PublishState,
    private events: PublisherEvents,
    opts: { now?: () => number } = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
  }

  get offsetMs() {
    return this.offset;
  }
  get offsetKnown() {
    return this.known;
  }
  get user() {
    return this.userId;
  }
  /** queued samples (≈ seconds of readings at 1 Hz) */
  get pending() {
    return this.outbox.length;
  }
  get claimPending() {
    return this.claim;
  }

  /** server-corrected now */
  serverNow() {
    return this.now() + this.offset;
  }

  /** server_time() three times; the median offset. Resolves true once an offset is known. */
  async syncClock(): Promise<boolean> {
    const got: number[] = [];
    for (let i = 0; i < 3; i++) {
      const sent = this.now();
      try {
        const server = await this.api.serverTime();
        const recv = this.now();
        if (recv - sent <= 5_000) got.push(offsetSample(server, sent, recv));
      } catch {
        /* one failed call doesn't sink the estimate */
      }
    }
    if (!got.length) return this.known;
    this.offsets = [...this.offsets, ...got].slice(-5);
    this.setOffset(medianOffset(got));
    return true;
  }

  private setOffset(o: number) {
    this.offset = o;
    if (!this.known) {
      this.known = true;
      // Re-stamp what was read before the clock was known with the first known offset.
      for (const q of this.outbox) if (q.offset == null) q.offset = o;
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Signed-in user changed (or signed out): the outbox is never uploaded under another user. */
  setUser(userId: string | null) {
    if (userId === this.userId) return;
    this.userId = userId;
    this.newStream();
  }

  /** New stream id, seq restarts, queued readings are dropped (user change, source kind switch). */
  newStream() {
    this.streamId = newId();
    this.seq = 0;
    this.outbox = [];
    this.claim = false;
  }

  /** "Add it again" after Remove */
  setSourceId(id: string) {
    this.sourceId = id;
    this.newStream();
  }

  /** stop calling (revoked, signed out); samples are not queued meanwhile */
  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.outbox = [];
  }

  discardOutbox() {
    this.outbox = [];
  }

  push(p: ParsedHr & { receivedLocalMs: number }) {
    if (!this.userId || this.paused) return;
    this.outbox.push({
      seq: ++this.seq,
      localMs: p.receivedLocalMs,
      offset: this.known ? this.offset : null,
      bpm: p.bpm,
      contact: p.contact,
    });
    if (this.outbox.length > OUTBOX_MAX) this.outbox.splice(0, this.outbox.length - OUTBOX_MAX);
  }

  /** every mode change is sent at once */
  modeChanged() {
    this.urgent = true;
  }

  /** the next call claims the relay (only after a user tap + fresh pick) */
  claimNext() {
    this.claim = true;
    this.urgent = true;
  }

  dropClaim() {
    this.claim = false;
  }

  private heartbeatMs(): number {
    const s = this.state();
    if (
      s.restingSinceLocal != null &&
      this.now() - s.restingSinceLocal >= RELAY_IDLE_BACKOFF_AFTER_MS
    )
      return RELAY_IDLE_HEARTBEAT_MS;
    return RELAY_HEARTBEAT_MS;
  }

  private request(batch: Queued[]): HrIngestRequest {
    const s = this.state();
    const iso = (local: number, off: number) => new Date(local + off).toISOString();
    return {
      p_source_id: this.sourceId,
      p_stream_id: this.streamId,
      p_expected_user_id: this.userId as string,
      p_source_kind: s.kind,
      p_mode: s.mode,
      p_connected_at:
        s.connectedAtLocal != null && this.known ? iso(s.connectedAtLocal, this.offset) : null,
      // A simulated strap never becomes the user's saved strap.
      p_sensor:
        s.kind === "demo" || !s.sensor
          ? null
          : { name: s.sensor.name, serial: s.sensor.serial, battery_pct: s.sensor.batteryPct },
      p_claim: this.claim,
      p_samples: batch.map((q) => ({
        seq: q.seq,
        measured_at: iso(q.localMs, q.offset ?? this.offset),
        bpm: q.bpm,
        contact: q.contact,
        rr_ms: null, // HR_STORE_RR is off
      })),
      p_source_name: s.sourceName,
      p_platform: s.platform,
    };
  }

  /** One scheduling step (exported for tests through flushNow). */
  async tick(): Promise<void> {
    if (this.paused || this.inFlight || !this.userId) return;
    if (this.state().mode === "unsupported") return;
    const now = this.now();
    if (now - this.lastCallAt < MIN_CALL_GAP_MS) return;
    if (now < this.retryAt) return;
    const sinceLast = now - this.lastCallAt;
    const samples = this.known ? this.outbox.length : 0;
    const due =
      this.urgent ||
      (samples > 0 && (sinceLast >= SAMPLE_FLUSH_MS || samples > 2)) ||
      sinceLast >= this.heartbeatMs();
    if (!due) return;
    await this.send();
  }

  private async send() {
    const batch = this.known ? this.outbox.slice(0, BATCH_MAX) : [];
    const req = this.request(batch);
    const user = this.userId;
    const stream = this.streamId;
    this.inFlight = true;
    this.urgent = false;
    const t0 = this.now();
    this.lastCallAt = t0;
    try {
      const res = await this.api.ingest(req);
      const t1 = this.now();
      // A user or stream change while the call was in flight: this response is for the old one.
      if (user !== this.userId || stream !== this.streamId) return;
      if (res.server_now && t1 - t0 <= 5_000) {
        this.offsets = [...this.offsets, offsetSample(Date.parse(res.server_now), t0, t1)].slice(
          -5,
        );
        this.setOffset(medianOffset(this.offsets));
      }
      this.failures = 0;
      this.retryAt = 0;
      this.events.onNetwork(true);
      if (res.identity_mismatch) {
        this.outbox = [];
      } else if (res.rate_limited) {
        this.retryAt = this.now() + 1_000;
        this.urgent = true;
      } else if (!res.superseded) {
        const sent = new Set(batch.map((q) => q.seq));
        this.outbox = this.outbox.filter((q) => !sent.has(q.seq));
        if (req.p_claim && !res.revoked) this.claim = false;
      }
      this.events.onResponse(res, { mode: req.p_mode, claim: req.p_claim });
    } catch (e) {
      if (e instanceof HrAuthError) {
        this.outbox = [];
        this.events.onAuthError();
        return;
      }
      this.failures++;
      this.retryAt = this.now() + Math.min(RETRY_MAX_MS, 1000 * 2 ** (this.failures - 1));
      this.urgent = this.urgent || req.p_mode !== this.state().mode || req.p_claim;
      this.events.onNetwork(false);
    } finally {
      this.inFlight = false;
    }
  }

  /** visibilitychange → hidden: one keepalive heartbeat with the current mode */
  keepalive() {
    if (!this.userId || this.paused || !this.api.ingestKeepalive) return;
    this.api.ingestKeepalive(this.request([]));
  }
}
