// The /relay state machine (h10-design 4.2 RelayMode, 6 S16). Owns sensor facts (link, contact,
// battery) and the RelayMode it publishes; the backend owns time, attribution and whether heart
// rate is wanted. Framework-free so it can be tested with a fake BluetoothDevice and fake timers.
//
//  idle ─tap Connect─▶ choosing ─pick─▶ connecting ─notify─▶ waiting_first ─sample─▶ live/no_contact
//  live ─link drop / 10 s without a notification─▶ reconnecting (1,2,4,8,15,15… s) ─2 min─▶ sensor_lost
//  any active mode ─stop_requested─▶ standby (BLE off, device kept) ─HR wanted again─▶ reconnect
//  superseded (another relay holds the user) ─Use this device─▶ claim; BLE off after 30 s
//  page hidden ▶ publishes `hidden` (one keepalive heartbeat) until visible again
// Any auth change discards the outbox, mints a new stream and resets seq (publisher.setUser).

import {
  RELAY_IDLE_BACKOFF_AFTER_MS,
  sensorActive,
  type HrIngestResponse,
  type HrSensorRow,
  type ParsedHr,
  type RelayMode,
  type SensorInfo,
  type SourceKind,
  type SupportResult,
} from "@/v1/core/hr";
import type { AuthUser, DillanApi } from "@/v1/data/api";
import { DemoHrsDriver } from "./demo-driver";
import { StaleAttemptError, TimeoutError, type RelayDriver } from "./driver";
import { IngestPublisher } from "./publisher";
import {
  platformOf,
  relayName,
  relaySourceId,
  remintSourceId,
  saveDeviceId,
  savedDeviceId,
  setRelayName,
} from "./source-id";
import { checkSupport, type RelayEnv } from "./support";
import { RelayWakeLock, type WakeState } from "./wake-lock";

export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
export const SENSOR_LOST_AFTER_MS = 120_000;
export const NO_NOTIFY_MS = 10_000;
export const SUPERSEDED_RELEASE_MS = 30_000;
const BATTERY_REREAD_MS = 5 * 60_000;
const CLOCK_RETRY_MS = 5_000;

export type RelayNotice =
  | "connect_timeout"
  | "chooser_empty"
  | "connect_failed"
  | "signed_out"
  | "sensor_forgotten"
  | "revoked";

export interface RelayView {
  /** what is published (hidden overlays an active link mode) */
  mode: RelayMode;
  /** the link mode under a `hidden` overlay */
  linkMode: RelayMode;
  support: SupportResult | null;
  clockReady: boolean;
  userId: string | null;
  signedOut: boolean;
  notice: RelayNotice | null;
  sensor: SensorInfo | null;
  bpm: number | null;
  contact: boolean | null;
  /** local time of the last call that delivered samples */
  lastSentLocal: number | null;
  offline: boolean;
  /** queued readings (≈ seconds) */
  pending: number;
  reconnectAttempt: number;
  holderName: string | null;
  differentStrap: { old: string; next: SensorInfo } | null;
  wake: WakeState;
  demo: boolean;
  /** idle or standby for 10 min: heartbeats back off and the wake lock is released */
  resting: boolean;
  sourceName: string;
  canGetDevices: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export interface RelayDeps {
  api: Pick<DillanApi, "auth" | "hr" | "realtime">;
  driver: RelayDriver;
  env: RelayEnv;
  storage?: Store;
  now?: () => number;
  /** wake lock implementation (tests pass null) */
  wakeApi?: ConstructorParameters<typeof RelayWakeLock>[1];
  /** a simulated strap (S16 "Simulate strap (DEMO)") */
  makeDemoDriver?: () => RelayDriver;
  /** BluetoothDevice getDevices() is available (gesture-free restore) */
  canGetDevices?: boolean;
}

const LINK_ACTIVE = new Set<RelayMode>([
  "connecting",
  "waiting_first",
  "live",
  "no_contact",
  "reconnecting",
  "demo",
]);

/** modes in which the relay holds (or is restoring) a strap picked before a Forget */
const FORGETTABLE = new Set<RelayMode>([
  "waiting_first",
  "live",
  "no_contact",
  "reconnecting",
  "hidden",
  "standby",
  "sensor_lost",
]);

export class RelayController {
  private listeners = new Set<() => void>();
  private snapshot: RelayView;
  private linkMode: RelayMode = "idle";
  private hidden = false;
  private support: SupportResult | null = null;
  private clockReady = false;
  private userId: string | null = null;
  /** the last signed-in user, kept across a sign-out (in memory only): a different next user is a
   *  wearer change, never a resume */
  private lastUserId: string | null = null;
  private signedOut = false;
  /** hr_ingest said this source was Removed: stays paused until Add it again */
  private revoked = false;
  private notice: RelayNotice | null = null;
  private sensor: SensorInfo | null = null;
  private bpm: number | null = null;
  private contact: boolean | null = null;
  private lastSentLocal: number | null = null;
  private offline = false;
  private reconnectAttempt = 0;
  private reconnectStart = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private holderName: string | null = null;
  private supersededAt = 0;
  private differentStrap: RelayView["differentStrap"] = null;
  private wakeState: WakeState = "off";
  private kind: SourceKind = "web_ble";
  private demoDriver: RelayDriver | null = null;
  private connectedAtLocal: number | null = null;
  private lastSampleLocal = 0;
  private restingSince: number | null = null;
  private batteryAt = 0;
  /** bumps on every connect/cancel so a stale continuation stops */
  private connectSeq = 0;
  private sensorRow: HrSensorRow | null = null;
  private storage: Store;
  private now: () => number;
  private publisher: IngestPublisher;
  private wake: RelayWakeLock;
  private sourceName: string;
  private offs: Array<() => void> = [];
  private sensorOff: (() => void) | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private d: RelayDeps) {
    this.storage = d.storage ?? null;
    this.now = d.now ?? (() => Date.now());
    this.sourceName = relayName(this.storage, d.env.userAgent);
    this.publisher = new IngestPublisher(
      d.api.hr,
      relaySourceId(this.storage),
      () => ({
        mode: this.mode,
        kind: this.kind,
        connectedAtLocal: this.connectedAtLocal,
        sensor: this.sensor,
        restingSinceLocal: this.restingSince,
        sourceName: this.sourceName,
        platform: platformOf(d.env.userAgent),
      }),
      {
        onResponse: (r, sent) => this.onResponse(r, sent),
        onAuthError: () => this.onSignedOut(),
        onSourceOwned: () => this.remintSource(),
        onNetwork: (ok) => {
          if (ok !== !this.offline) return;
          this.offline = !ok;
          this.emit();
        },
      },
      { now: this.now },
    );
    this.wake = new RelayWakeLock((s) => {
      this.wakeState = s;
      this.emit();
    }, d.wakeApi);
    this.snapshot = this.build();
  }

  // ---------------------------------------------------------------- view
  get mode(): RelayMode {
    return this.hidden && LINK_ACTIVE.has(this.linkMode) ? "hidden" : this.linkMode;
  }

  private build(): RelayView {
    return {
      mode: this.mode,
      linkMode: this.linkMode,
      support: this.support,
      clockReady: this.clockReady,
      userId: this.userId,
      signedOut: this.signedOut,
      notice: this.notice,
      sensor: this.sensor,
      bpm: this.bpm,
      contact: this.contact,
      lastSentLocal: this.lastSentLocal,
      offline: this.offline,
      pending: this.publisher.pending,
      reconnectAttempt: this.reconnectAttempt,
      holderName: this.holderName,
      differentStrap: this.differentStrap,
      wake: this.wakeState,
      demo: this.kind === "demo",
      resting:
        this.restingSince != null && this.now() - this.restingSince >= RELAY_IDLE_BACKOFF_AFTER_MS,
      sourceName: this.sourceName,
      canGetDevices: !!this.d.canGetDevices,
    };
  }

  private emit() {
    if (this.disposed) return;
    this.snapshot = this.build();
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.snapshot;

  /** server-corrected now */
  serverNow() {
    return this.publisher.serverNow();
  }

  get streamId() {
    return this.publisher.streamId;
  }

  get sourceId() {
    return this.publisher.sourceId;
  }

  private get driver(): RelayDriver {
    return this.kind === "demo" && this.demoDriver ? this.demoDriver : this.d.driver;
  }

  private setMode(m: RelayMode) {
    if (m === this.linkMode) {
      this.emit();
      return;
    }
    this.linkMode = m;
    if (m === "idle" || m === "standby") this.restingSince ??= this.now();
    else this.restingSince = null;
    if (!LINK_ACTIVE.has(m))
      this.connectedAtLocal = m === "superseded" ? this.connectedAtLocal : null;
    this.publisher.modeChanged();
    this.updateWake();
    this.emit();
  }

  private updateWake() {
    const resting =
      this.restingSince != null && this.now() - this.restingSince >= RELAY_IDLE_BACKOFF_AFTER_MS;
    this.wake.setWanted(!!this.support?.ok && !resting);
  }

  // ---------------------------------------------------------------- lifecycle
  async start(): Promise<void> {
    this.support = await checkSupport(this.d.env);
    if (this.disposed) return;
    if (!this.support.ok) {
      // Unsupported pages never call hr_ingest.
      this.linkMode = "unsupported";
      this.emit();
      return;
    }
    this.restingSince = this.now();
    this.offs.push(this.d.driver.onSample((p) => this.onSample(this.d.driver, p)));
    this.offs.push(this.d.driver.onLinkChange((up) => this.onLink(this.d.driver, up)));
    this.offs.push(this.d.api.auth.onChange((u) => void this.handleUser(u)));
    const user = await this.d.api.auth.getUser().catch(() => null);
    if (this.disposed) return;
    await this.handleUser(user);
    this.publisher.start();
    this.watchdog = setInterval(() => this.tick(), 1_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      this.offs.push(() => document.removeEventListener("visibilitychange", this.onVisibility));
    }
    this.updateWake();
    this.emit();
    void this.syncClock();
    void this.tryRestore();
  }

  dispose() {
    this.disposed = true;
    this.publisher.stop();
    this.offs.forEach((f) => f());
    this.offs = [];
    this.sensorOff?.();
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.wake.setWanted(false);
    void this.driver.disconnect();
  }

  private async syncClock() {
    const ok = await this.publisher.syncClock();
    if (this.disposed) return;
    if (ok) {
      this.clockReady = true;
      this.emit();
    } else this.clockTimer = setTimeout(() => void this.syncClock(), CLOCK_RETRY_MS);
  }

  /** getDevices(): a strap granted on an earlier load reconnects without a tap (never relied on). */
  private async tryRestore() {
    if (!this.d.canGetDevices || this.d.driver.hasDevice()) return;
    const info = await this.d.driver.restore(savedDeviceId(this.storage));
    if (!info || this.disposed || this.linkMode !== "idle" || !this.userId) return;
    this.sensor = info;
    void this.connect({ claim: false, silent: true });
  }

  private async handleUser(u: AuthUser | null) {
    const next = u?.id ?? null;
    if (!next) {
      // Signed out: BLE stays connected, queued readings are discarded, nothing is sent.
      if (this.userId || !this.signedOut) this.onSignedOut();
      return;
    }
    if (next === this.userId) {
      // Same user (token refresh, SIGNED_IN on focus): nothing changes. A revoked relay stays
      // paused until Add it again.
      this.emit();
      return;
    }
    // A different wearer than the last signed-in user, directly or after a sign-out (h10-design
    // 4.2): drop the strap to idle BEFORE the publisher is bound to the new user, so nothing read
    // for the previous wearer (samples, the connected strap) is ever sent as them.
    const wearerChange = this.lastUserId != null && next !== this.lastUserId;
    this.publisher.setPaused(true);
    if (wearerChange) {
      this.dropLink();
      // hr_sources ids belong to one user: the next wearer gets a fresh one.
      this.revoked = false;
      if (this.notice === "revoked" || this.notice === "sensor_forgotten") this.notice = null;
      this.publisher.setSourceId(remintSourceId(this.storage));
    }
    this.signedOut = false;
    if (this.notice === "signed_out") this.notice = null;
    this.publisher.setUser(next); // discards the outbox, new stream, seq 0
    this.userId = next;
    this.lastUserId = next;
    this.publisher.setPaused(this.revoked);
    this.subscribeSensor(next);
    this.emit();
  }

  /** Wearer change: strap disconnected, everything known about it cleared, idle. */
  private dropLink() {
    this.stopReconnect();
    this.connectSeq++;
    if (this.kind === "demo") {
      void this.demoDriver?.disconnect();
      this.kind = "web_ble";
    }
    void this.d.driver.disconnect();
    this.sensor = null;
    this.bpm = null;
    this.contact = null;
    this.holderName = null;
    this.differentStrap = null;
    this.connectedAtLocal = null;
    this.publisher.dropClaim();
    this.setMode("idle");
  }

  /** hr_ingest refused the source id as another user's (a stale id on a shared device). */
  private remintSource() {
    this.publisher.setSourceId(remintSourceId(this.storage));
    this.publisher.modeChanged();
    this.emit();
  }

  private onSignedOut() {
    this.signedOut = true;
    this.notice = "signed_out";
    this.userId = null;
    this.publisher.setUser(null);
    this.publisher.setPaused(true);
    this.sensorOff?.();
    this.sensorOff = null;
    this.sensorRow = null;
    this.emit();
  }

  private subscribeSensor(uid: string) {
    this.sensorOff?.();
    this.sensorRow = null;
    void this.d.api.hr
      .sensorRow()
      .then((r) => {
        if (this.userId === uid) this.sensorRow = r;
      })
      .catch(() => undefined);
    this.sensorOff = this.d.api.realtime.onHrSensor(uid, (row) => this.onSensorRow(row));
  }

  /** The relay's own hr_sensors row: wakes it from standby when a preflight asks for HR. */
  private onSensorRow(row: HrSensorRow | null) {
    this.sensorRow = row;
    if (!row) return;
    if (row.forgotten_at && this.holdsForgettableStrap()) {
      void this.onForgotten();
      return;
    }
    const wanted = row.wanted_until != null && Date.parse(row.wanted_until) > this.serverNow();
    if (wanted && this.linkMode === "standby") void this.wakeFromStandby();
  }

  // ---------------------------------------------------------------- user actions
  /**
   * Connect strap. MUST be called synchronously from the click handler: driver.pick() calls
   * navigator.bluetooth.requestDevice before any await (transient user activation).
   */
  connectTap(opts: { showAll?: boolean } = {}) {
    if (!this.support?.ok || !this.clockReady || this.signedOut || !this.userId) return;
    if (this.kind === "demo") return;
    this.notice = null;
    this.differentStrap = null;
    this.stopReconnect();
    const seq = ++this.connectSeq;
    const picked = this.d.driver.pick(opts);
    this.setMode("choosing");
    picked.then(
      (info) => {
        if (seq !== this.connectSeq) return;
        saveDeviceId(this.storage, this.d.driver.deviceId());
        void this.afterPick(info, seq);
      },
      (e: unknown) => {
        if (seq !== this.connectSeq) return;
        const name = (e as { name?: string } | null)?.name;
        // Cancel or an empty chooser: back to idle with the "No strap found?" help, no error.
        this.notice = name === "NotFoundError" ? "chooser_empty" : "connect_failed";
        this.setMode("idle");
      },
    );
  }

  private async afterPick(info: SensorInfo, seq: number) {
    this.sensor = info;
    const row = this.sensorRow ?? (await this.d.api.hr.sensorRow().catch(() => null));
    if (seq !== this.connectSeq) return;
    this.sensorRow = row;
    if (
      sensorActive(row) &&
      row.sensor_serial &&
      info.serial &&
      row.sensor_serial.toUpperCase() !== info.serial.toUpperCase()
    ) {
      // Nothing is sent until the user confirms this strap.
      this.differentStrap = { old: row.sensor_name, next: info };
      this.setMode("idle");
      return;
    }
    await this.connect({ claim: true, silent: false });
  }

  /** Different strap: "Use this strap" */
  useThisStrap() {
    if (!this.differentStrap) return;
    this.sensor = this.differentStrap.next;
    this.differentStrap = null;
    void this.connect({ claim: true, silent: false });
  }

  /** Different strap: "Pick again" (the user taps Connect strap again) */
  pickAgain() {
    this.differentStrap = null;
    this.sensor = null;
    void this.d.driver.disconnect();
    this.setMode("idle");
  }

  private async connect(o: { claim: boolean; silent: boolean }) {
    const seq = ++this.connectSeq;
    this.setMode("connecting");
    try {
      const info = await this.driver.reconnect();
      if (seq !== this.connectSeq) return;
      this.sensor = info;
      this.batteryAt = this.now();
      this.connectedAtLocal = this.now();
      this.lastSampleLocal = this.now();
      this.reconnectAttempt = 0;
      if (o.claim) this.publisher.claimNext();
      this.setMode("waiting_first");
    } catch (e) {
      if (e instanceof StaleAttemptError || seq !== this.connectSeq) return;
      if (!o.silent) this.notice = e instanceof TimeoutError ? "connect_timeout" : "connect_failed";
      this.setMode("idle");
    }
  }

  /** Cancel while connecting */
  cancel() {
    this.connectSeq++;
    this.driver.cancel();
    this.setMode("idle");
  }

  /** Disconnect (keeps the device object for a later Reconnect) */
  disconnectTap() {
    if (this.kind === "demo") {
      this.stopDemo();
      return;
    }
    this.connectSeq++;
    this.stopReconnect();
    void this.driver.disconnect();
    this.bpm = null;
    this.contact = null;
    this.setMode("idle");
  }

  /** Reconnecting: "Reconnect now" */
  reconnectNow() {
    if (this.linkMode !== "reconnecting") return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    void this.reconnectAttemptOnce();
  }

  /** sensor_lost: "Reconnect" (a gesture; falls back to the chooser without a device object) */
  reconnectTap() {
    if (!this.driver.hasDevice()) {
      this.connectTap();
      return;
    }
    this.stopReconnect();
    void this.connect({ claim: false, silent: false });
  }

  /** standby: "Connect now" */
  connectNow() {
    if (this.linkMode !== "standby") return;
    if (!this.driver.hasDevice()) {
      this.connectTap();
      return;
    }
    // A tap opens a fresh demand window, like a claim.
    void this.connect({ claim: true, silent: false });
  }

  /** superseded: "Use this device" */
  useThisDevice() {
    if (this.linkMode !== "superseded") return;
    this.holderName = null;
    if (this.connectedAtLocal != null) {
      this.publisher.claimNext();
      this.setMode("waiting_first");
    } else if (this.driver.hasDevice()) void this.connect({ claim: true, silent: false });
    else {
      this.publisher.claimNext();
      this.setMode("idle");
    }
  }

  /** revoked: "Add it again" mints a new source id; the next Connect claims. */
  addAgain() {
    const id = remintSourceId(this.storage);
    this.revoked = false;
    this.publisher.setSourceId(id);
    this.publisher.setPaused(!this.userId);
    this.notice = null;
    this.setMode("idle");
  }

  rename(name: string): string {
    const v = setRelayName(this.storage, name);
    this.sourceName = v || relayName(this.storage, this.d.env.userAgent);
    void this.d.api.hr
      .renameSource(this.publisher.sourceId, this.sourceName)
      .catch(() => undefined);
    this.publisher.modeChanged();
    this.emit();
    return this.sourceName;
  }

  /** "Simulate strap (DEMO)": demo samples only, own stream, persistent DEMO badge. */
  startDemo() {
    if (this.kind === "demo" || !this.support?.ok || !this.userId) return;
    this.connectSeq++;
    this.stopReconnect();
    void this.d.driver.disconnect();
    this.demoDriver ??= (this.d.makeDemoDriver ?? (() => new DemoHrsDriver(this.now)))();
    const demo = this.demoDriver;
    this.offs.push(demo.onSample((p) => this.onSample(demo, p)));
    this.offs.push(demo.onLinkChange((up) => this.onLink(demo, up)));
    this.kind = "demo";
    this.publisher.newStream();
    this.notice = null;
    this.bpm = null;
    void this.connect({ claim: true, silent: false });
  }

  stopDemo() {
    if (this.kind !== "demo") return;
    this.connectSeq++;
    void this.demoDriver?.disconnect();
    this.kind = "web_ble";
    this.publisher.newStream();
    this.bpm = null;
    this.contact = null;
    this.setMode("idle");
  }

  /** beforeunload: "Leaving stops heart rate on the TV." while connected */
  shouldWarnOnLeave(): boolean {
    return this.connectedAtLocal != null || LINK_ACTIVE.has(this.linkMode);
  }

  // ---------------------------------------------------------------- events
  private onSample(from: RelayDriver, p: ParsedHr & { receivedLocalMs: number }) {
    if (from !== this.driver) return;
    if (!["waiting_first", "live", "no_contact", "reconnecting", "demo"].includes(this.linkMode))
      return; // standby / superseded / idle: nothing is sent
    this.lastSampleLocal = this.now();
    this.bpm = p.bpm;
    this.contact = p.contact;
    this.publisher.push(p);
    if (this.kind === "demo") this.setMode("demo");
    else if (p.contact === false) this.setMode("no_contact");
    else if (p.bpm != null) this.setMode("live");
    else this.emit();
  }

  private onLink(from: RelayDriver, up: boolean) {
    if (from !== this.driver || up) return;
    if (!["waiting_first", "live", "no_contact", "demo"].includes(this.linkMode)) return;
    this.startReconnect();
  }

  private startReconnect() {
    if (this.linkMode === "reconnecting") return;
    this.connectedAtLocal = null;
    this.reconnectStart = this.now();
    this.reconnectAttempt = 0;
    this.setMode("reconnecting");
    this.schedule();
  }

  private schedule() {
    const i = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectAttemptOnce();
    }, RECONNECT_BACKOFF_MS[i]);
  }

  private async reconnectAttemptOnce() {
    if (this.linkMode !== "reconnecting") return;
    this.reconnectAttempt++;
    this.emit();
    const seq = ++this.connectSeq;
    try {
      const info = await this.driver.reconnect();
      if (seq !== this.connectSeq || this.linkMode !== "reconnecting") return;
      this.sensor = info;
      this.connectedAtLocal = this.now();
      this.lastSampleLocal = this.now();
      this.batteryAt = this.now();
      this.setMode("waiting_first");
    } catch (e) {
      if (e instanceof StaleAttemptError || seq !== this.connectSeq) return;
      if (this.linkMode !== "reconnecting") return;
      if (this.now() - this.reconnectStart >= SENSOR_LOST_AFTER_MS) {
        this.setMode("sensor_lost");
        return;
      }
      this.schedule();
    }
  }

  private stopReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async goStandby() {
    this.stopReconnect();
    this.connectSeq++;
    await this.driver.disconnect(); // keeps the BluetoothDevice for a gesture-free reconnect
    this.bpm = null;
    this.contact = null;
    this.setMode("standby");
  }

  private async wakeFromStandby() {
    if (this.linkMode !== "standby") return;
    if (!this.driver.hasDevice()) {
      this.setMode("idle");
      return;
    }
    this.reconnectStart = this.now();
    this.reconnectAttempt = 0;
    this.connectedAtLocal = null;
    this.setMode("reconnecting");
    await this.reconnectAttemptOnce();
  }

  /**
   * sensor_forgotten applies to a strap this relay held before the Forget, never to a connect the
   * user is making now (choosing/connecting, or a claim not yet sent: that claim re-pairs it).
   */
  private holdsForgettableStrap(): boolean {
    if (this.kind === "demo" || this.publisher.claimPending) return false;
    return FORGETTABLE.has(this.linkMode);
  }

  private async onForgotten() {
    this.stopReconnect();
    this.connectSeq++;
    await this.d.driver.forget();
    saveDeviceId(this.storage, null);
    this.sensor = null;
    this.bpm = null;
    this.contact = null;
    this.notice = "sensor_forgotten";
    this.setMode("idle");
  }

  private onResponse(r: HrIngestResponse, sent: { mode: RelayMode; claim: boolean }) {
    // Delivered to Dillan (stored, duplicate, or refused as outside a session alike).
    if (r.accepted + r.duplicates + r.rejected.length > 0) this.lastSentLocal = this.now();
    if (r.identity_mismatch) {
      void this.d.api.auth.getUser().then((u) => this.handleUser(u));
      return;
    }
    if (r.revoked) {
      this.revoked = true;
      this.stopReconnect();
      this.connectSeq++;
      void this.driver.disconnect();
      this.publisher.setPaused(true);
      this.notice = "revoked";
      this.bpm = null;
      this.setMode("idle");
      return;
    }
    if (r.superseded) {
      // A refused claim is not retried on its own: the user taps Use this device.
      this.publisher.dropClaim();
      if (this.linkMode !== "superseded") {
        this.supersededAt = this.now();
        this.holderName = r.holder_name;
        this.stopReconnect();
        this.setMode("superseded");
      }
      return;
    }
    if (r.sensor_forgotten) {
      // One shot: onForgotten drops to idle, and idle never re-runs it.
      if (!sent.claim && this.holdsForgettableStrap()) void this.onForgotten();
      return;
    }
    if (r.rate_limited) return;
    // While the user is connecting (or their claim is not yet delivered), "not wanted" is stale:
    // the claim that follows the pick opens the demand window.
    const userConnecting =
      this.linkMode === "choosing" || this.linkMode === "connecting" || this.publisher.claimPending;
    if (r.stop_requested && userConnecting) return this.emit();
    if (r.stop_requested) {
      // Standby frees the strap's BLE slot. The simulated strap holds none and never saves a
      // strap (so no demand window can open for it): it keeps sending and the backend decides
      // what to store and publish (only demo sessions take its readings).
      if (this.kind === "demo") return this.emit();
      if (LINK_ACTIVE.has(this.linkMode) || this.linkMode === "sensor_lost") void this.goStandby();
    } else if (this.linkMode === "standby") {
      void this.wakeFromStandby();
    }
    this.emit();
  }

  private onVisibility = () => {
    const hidden = document.visibilityState === "hidden";
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.publisher.modeChanged();
    if (hidden) this.publisher.keepalive();
    else void this.wake.request();
    this.emit();
  };

  /** 1 s housekeeping: no-notify watchdog, superseded release, resting back-off, battery. */
  tick() {
    const now = this.now();
    if (
      (this.linkMode === "live" || this.linkMode === "no_contact" || this.linkMode === "demo") &&
      now - this.lastSampleLocal > NO_NOTIFY_MS
    ) {
      // Connected but silent for 10 s: treat it as a link loss.
      this.driver.cancel();
      this.startReconnect();
    }
    if (
      this.linkMode === "superseded" &&
      this.connectedAtLocal != null &&
      now - this.supersededAt >= SUPERSEDED_RELEASE_MS
    ) {
      // Free the H10's second BLE slot.
      this.connectedAtLocal = null;
      void this.driver.disconnect();
    }
    if (
      this.connectedAtLocal != null &&
      this.kind === "web_ble" &&
      now - this.batteryAt >= BATTERY_REREAD_MS
    ) {
      this.batteryAt = now;
      void this.driver.readBattery().then((b) => {
        if (this.sensor && b != null) this.sensor = { ...this.sensor, batteryPct: b };
      });
    }
    this.updateWake();
    this.emit();
  }
}
