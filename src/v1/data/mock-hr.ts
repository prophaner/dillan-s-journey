// Heart rate in the mock backend (dev only, ?mock=1; every screen shows the "Mock data" badge).
//
// 1. mockIngest(): an in-memory port of public.hr_ingest (0006_v1_core.sql): identity check,
//    source registry + revoke, 3 calls/s rate limit, the one-active-relay fence, demand window
//    (stop_requested), measured_at clamp, session attribution by measured_at with demo/real
//    separation, dedupe by (stream_id, seq), late samples marking the summary dirty, and the
//    monotonic hr_live upsert. /relay?mock=1 (real Bluetooth or "Simulate strap (DEMO)") writes
//    here, and other tabs (the TV) see it through the shared localStorage db.
// 2. A simulated relay ("Demo relay", source_kind 'demo'): when no relay tab is publishing, it
//    produces one DEMO reading per second, so its readings carry the DEMO badge and count only in
//    demo sessions (S14 dev "Start demo workout"). A dev control (MockHrControl) switches it:
//      live | stall (heartbeats, no readings: Delayed at 10 s, No recent at 30 s)
//      | offline (nothing: Delayed at 10 s, Relay offline at 15 s) | no_contact | waiting
//      | delayed (15 s old) | stale (45 s old) | off (no relay, no strap: Not set up)
//    kept in localStorage["dillan.mock.hr"] with the time it was chosen, so every tab agrees.
//    Readings are a deterministic function of time; gaps from stall/offline/waiting/off are
//    remembered so the finalized summary leaves them Unmeasured like the live dashboard did.

import {
  type HrIngestRequest,
  type HrIngestResponse,
  type HrLiveRow,
  type HrRejectReason,
  type HrSensorRow,
  type HrSourceRow,
  type StoredSample,
} from "@/v1/core/hr";
import type { SessionSummaryRow, WorkoutSessionRow } from "@/v1/core/types";
import { HrSourceOwnedError } from "./api";

export const MOCK_HR_KEY = "dillan.mock.hr";
export const MOCK_HR_SINCE_KEY = "dillan.mock.hr.since";
export const MOCK_HR_GAPS_KEY = "dillan.mock.hr.gaps";
export type MockHrMode =
  "live" | "stall" | "offline" | "no_contact" | "waiting" | "delayed" | "stale" | "off";
export const MOCK_HR_MODES: MockHrMode[] = [
  "live",
  "stall",
  "offline",
  "no_contact",
  "waiting",
  "delayed",
  "stale",
  "off",
];
/** modes in which the simulated relay sends no readings */
const NO_READINGS: MockHrMode[] = ["stall", "offline", "waiting", "off"];

export const SIM_SOURCE_ID = "00000000-0000-4000-8000-0000000000e1";
export const SIM_STREAM_ID = "00000000-0000-4000-8000-0000000000e2";
export const SIM_NAME = "Demo relay";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export function readMockHrMode(storage: Store): MockHrMode {
  try {
    const v = storage?.getItem(MOCK_HR_KEY) as MockHrMode | null | undefined;
    return v && MOCK_HR_MODES.includes(v) ? v : "live";
  } catch {
    return "live";
  }
}

export function readMockHrSince(storage: Store): number {
  try {
    return Number(storage?.getItem(MOCK_HR_SINCE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function readMockHrGaps(storage: Store): Array<[number, number]> {
  try {
    const v = JSON.parse(storage?.getItem(MOCK_HR_GAPS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Array<[number, number]>).slice(-50) : [];
  } catch {
    return [];
  }
}

/** Dev control: switch the simulated relay (records the gap the previous mode left). */
export function writeMockHrMode(storage: Store, mode: MockHrMode, now: number) {
  try {
    const prev = readMockHrMode(storage);
    const since = readMockHrSince(storage);
    if (NO_READINGS.includes(prev) && since > 0) {
      const gaps = [...readMockHrGaps(storage), [since, now] as [number, number]].slice(-50);
      storage?.setItem(MOCK_HR_GAPS_KEY, JSON.stringify(gaps));
    }
    storage?.setItem(MOCK_HR_KEY, mode);
    storage?.setItem(MOCK_HR_SINCE_KEY, String(now));
  } catch {
    /* storage blocked */
  }
}

/** 90-150 bpm wave: crosses a few zones in a few minutes. */
export function simBpm(t: number): number {
  return Math.round(
    120 + 24 * Math.sin((t / 120_000) * 2 * Math.PI) + 6 * Math.sin((t / 9_000) * 2 * Math.PI),
  );
}

const iso = (ms: number) => new Date(ms).toISOString();
const sec = (ms: number) => Math.floor(ms / 1000) * 1000;

/** The simulated relay's hr_live row (null when the simulator is off). */
export function simHrLive(
  userId: string,
  mode: MockHrMode,
  since: number,
  now: number,
  activeSessionId: string | null,
): HrLiveRow | null {
  if (mode === "off") return null;
  const frozen = mode === "stall" || mode === "offline";
  const lag = mode === "delayed" ? 15_000 : mode === "stale" ? 45_000 : 1_000;
  const measured =
    mode === "waiting" ? null : frozen ? sec(Math.min(since || now, now) - 1_000) : sec(now - lag);
  const seen = mode === "offline" ? Math.min(since || now, now) : now - 500;
  const contact = mode === "waiting" ? null : mode !== "no_contact";
  return {
    user_id: userId,
    rev: mode === "offline" ? sec(seen) : sec(now),
    active_session_id: activeSessionId,
    holder_source_id: SIM_SOURCE_ID,
    holder_stream_id: SIM_STREAM_ID,
    holder_name: SIM_NAME,
    source_kind: "demo",
    relay_mode:
      mode === "waiting" ? "waiting_first" : mode === "no_contact" ? "no_contact" : "live",
    sensor_name: "Simulated strap (DEMO)",
    sensor_serial: null,
    battery_pct: null,
    bpm: measured == null || contact === false ? null : simBpm(measured),
    contact,
    measured_at: measured == null ? null : iso(measured),
    connected_at: iso(now - 600_000),
    last_seen_at: iso(seen),
    is_demo: true,
    updated_at: iso(seen),
  };
}

/** The simulated relay's readings for one session: demo sessions only, never real ones. */
export function simSamples(
  row: WorkoutSessionRow,
  mode: MockHrMode,
  since: number,
  gaps: Array<[number, number]>,
  now: number,
): StoredSample[] {
  if (!row.live_data || !row.is_demo || !row.started_at) return [];
  const start = Math.ceil(Date.parse(row.started_at) / 1000) * 1000;
  let end = row.ended_at ? Date.parse(row.ended_at) : now;
  const lag = mode === "delayed" ? 15_000 : mode === "stale" ? 45_000 : 0;
  if (!row.ended_at) end -= lag;
  const open: Array<[number, number]> = NO_READINGS.includes(mode)
    ? [...gaps, [since || now, Number.POSITIVE_INFINITY]]
    : gaps;
  const out: StoredSample[] = [];
  for (let t = start; t < end && out.length < 100_000; t += 1000) {
    if (open.some(([a, b]) => t >= a && t < b)) continue;
    out.push({
      stream_id: SIM_STREAM_ID,
      seq: t / 1000,
      measured_at: t,
      bpm: mode === "no_contact" ? null : simBpm(t),
      contact: mode !== "no_contact",
      is_demo: true,
    });
  }
  return out;
}

// --------------------------------------------------------------------------------------------
// In-memory hr_ingest

export interface MockHrSource extends HrSourceRow {
  rate_window_at: number | null;
  rate_count: number;
}

export interface MockStoredSample extends StoredSample {
  user_id: string;
  session_id: string;
  source_id: string;
}

export interface MockHrDb {
  sources: MockHrSource[];
  sensors: HrSensorRow[];
  live: HrLiveRow[];
  samples: MockStoredSample[];
}

export function emptyHrDb(): MockHrDb {
  return { sources: [], sensors: [], live: [], samples: [] };
}

const base = (now: number) => ({
  server_now: iso(now),
  accepted: 0,
  duplicates: 0,
  rejected: [] as Array<{ seq: number; reason: HrRejectReason }>,
  superseded: false,
  holder_name: null as string | null,
  rate_limited: false,
  revoked: false,
  identity_mismatch: false,
  stop_requested: false,
  sensor_forgotten: false,
});

export function mockIngest(
  hr: MockHrDb,
  data: { sessions: WorkoutSessionRow[]; summaries: SessionSummaryRow[] },
  uid: string,
  req: HrIngestRequest,
  now: number,
): HrIngestResponse {
  if (req.p_expected_user_id !== uid) return { ...base(now), identity_mismatch: true };
  if (req.p_samples.length > 30) throw new Error("too many samples");
  const isDemo = req.p_source_kind === "demo";

  // 3. source registry
  let src = hr.sources.find((s) => s.id === req.p_source_id);
  if (src && src.user_id !== uid) throw new HrSourceOwnedError();
  if (!src) {
    src = {
      id: req.p_source_id,
      user_id: uid,
      kind: req.p_source_kind,
      display_name:
        (req.p_source_name ?? "").trim().slice(0, 60) || (isDemo ? "Demo relay" : "Relay"),
      platform: req.p_platform ?? null,
      last_seen_at: iso(now),
      created_at: iso(now),
      revoked_at: null,
      rate_window_at: now,
      rate_count: 1,
    };
    hr.sources.push(src);
  } else {
    if (src.revoked_at) return { ...base(now), revoked: true, stop_requested: true };
    if (src.rate_window_at != null && now - src.rate_window_at < 1000) src.rate_count++;
    else {
      src.rate_window_at = now;
      src.rate_count = 1;
    }
    src.last_seen_at = iso(now);
    if (src.rate_count > 3) return { ...base(now), rate_limited: true };
  }

  // 5. fence
  let live = hr.live.find((l) => l.user_id === uid) ?? null;
  if (live) {
    const fresh =
      now - Date.parse(live.last_seen_at) <=
      (live.relay_mode === "idle" || live.relay_mode === "standby" ? 75_000 : 15_000);
    let take: boolean;
    if (live.holder_stream_id === req.p_stream_id) take = true;
    else if (live.holder_source_id === req.p_source_id) take = true;
    else if (isDemo && live.source_kind !== "demo" && fresh) take = false;
    else if (live.source_kind === "demo" && !isDemo) take = true;
    else if (!fresh && req.p_mode !== "superseded") take = true;
    else take = fresh && req.p_claim;
    if (!take) return { ...base(now), superseded: true, holder_name: live.holder_name };
  }

  // 10. sensor row
  let sensor = hr.sensors.find((s) => s.user_id === uid) ?? null;
  let forgotten = false;
  const bat =
    req.p_sensor && Number.isInteger(req.p_sensor.battery_pct) ? req.p_sensor.battery_pct : null;
  if (!sensor) {
    if (req.p_sensor) {
      sensor = {
        user_id: uid,
        sensor_kind: req.p_sensor.serial ? "polar_h10" : "generic_hrs",
        sensor_name: req.p_sensor.name.slice(0, 80),
        sensor_serial: req.p_sensor.serial,
        paired_at: iso(now),
        forgotten_at: null,
        wanted_until: req.p_claim ? iso(now + 600_000) : null,
        last_source_id: src.id,
        last_battery_pct: bat,
        battery_read_at: bat != null ? iso(now) : null,
      };
      hr.sensors.push(sensor);
    }
  } else if (sensor.forgotten_at) {
    if (req.p_claim && req.p_sensor) {
      Object.assign(sensor, {
        forgotten_at: null,
        paired_at: iso(now),
        sensor_name: req.p_sensor.name.slice(0, 80),
        sensor_serial: req.p_sensor.serial,
        last_source_id: src.id,
        wanted_until: iso(now + 600_000),
      });
    } else forgotten = true;
  } else {
    sensor.last_source_id = src.id;
    if (bat != null) {
      sensor.last_battery_pct = bat;
      sensor.battery_read_at = iso(now);
    }
    if (req.p_claim) {
      const cur = sensor.wanted_until ? Date.parse(sensor.wanted_until) : now;
      sensor.wanted_until = iso(Math.max(cur, now + 600_000));
    }
  }

  // 7. wanted?
  const active = data.sessions
    .filter(
      (s) =>
        s.user_id === uid &&
        (s.state === "active" || s.state === "paused") &&
        s.live_data &&
        s.is_demo === isDemo &&
        s.started_at &&
        Date.parse(s.started_at) > now - 6 * 3_600_000,
    )
    .sort((a, b) => Date.parse(b.started_at as string) - Date.parse(a.started_at as string))[0];
  const wanted =
    !forgotten &&
    (!!active || (sensor?.wanted_until != null && Date.parse(sensor.wanted_until) > now));

  // 6 + 8. validate, attribute, store
  const res = base(now);
  let latest: { m: number; bpm: number | null; contact: boolean | null } | null = null;
  for (const s of req.p_samples) {
    const m = Date.parse(s.measured_at);
    if (!Number.isInteger(s.seq) || s.seq < 0 || Number.isNaN(m)) {
      res.rejected.push({ seq: s.seq, reason: "out_of_range" });
      continue;
    }
    if (m < now - 150_000) {
      res.rejected.push({ seq: s.seq, reason: "too_old" });
      continue;
    }
    if (m > now + 5_000) {
      res.rejected.push({ seq: s.seq, reason: "future" });
      continue;
    }
    const contact = typeof s.contact === "boolean" ? s.contact : null;
    const bpm =
      Number.isInteger(s.bpm) &&
      (s.bpm as number) >= 25 &&
      (s.bpm as number) <= 250 &&
      contact !== false
        ? s.bpm
        : null;
    if (!latest || m > latest.m) latest = { m, bpm, contact };
    if (forgotten) {
      res.rejected.push({ seq: s.seq, reason: "sensor_forgotten" });
      continue;
    }
    const inSession = (x: WorkoutSessionRow) =>
      x.user_id === uid &&
      x.live_data &&
      !!x.started_at &&
      Date.parse(x.started_at) <= m &&
      (!x.ended_at || m < Date.parse(x.ended_at)) &&
      Date.parse(x.started_at) > m - 6 * 3_600_000;
    const sess = data.sessions
      .filter((x) => inSession(x) && x.is_demo === isDemo)
      .sort((a, b) => Date.parse(b.started_at as string) - Date.parse(a.started_at as string))[0];
    if (!sess) {
      res.rejected.push({
        seq: s.seq,
        reason: data.sessions.some((x) => inSession(x) && x.is_demo !== isDemo)
          ? "demo_mismatch"
          : "outside_session",
      });
      continue;
    }
    if (
      hr.samples.some(
        (x) => x.user_id === uid && x.stream_id === req.p_stream_id && x.seq === s.seq,
      )
    ) {
      res.duplicates++;
      continue;
    }
    hr.samples.push({
      user_id: uid,
      session_id: sess.id,
      source_id: src.id,
      stream_id: req.p_stream_id,
      seq: s.seq,
      measured_at: m,
      bpm,
      contact,
      is_demo: isDemo,
    });
    res.accepted++;
    if (sess.ended_at && Date.parse(sess.ended_at) > now - 120_000) {
      const sum = data.summaries.find((x) => x.session_id === sess.id);
      if (sum) sum.hr_finalize_dirty = true;
    }
  }

  // 9. hr_live
  const ca = req.p_connected_at ? Date.parse(req.p_connected_at) : NaN;
  const conn = !Number.isNaN(ca) && ca >= now - 150_000 && ca <= now + 5_000 ? iso(ca) : null;
  const blank = !wanted || ["idle", "standby", "sensor_lost"].includes(req.p_mode);
  if (!live) {
    live = {
      user_id: uid,
      rev: now,
      active_session_id: active?.id ?? null,
      holder_source_id: src.id,
      holder_stream_id: req.p_stream_id,
      holder_name: src.display_name,
      source_kind: req.p_source_kind,
      relay_mode: req.p_mode,
      sensor_name: req.p_sensor?.name ?? null,
      sensor_serial: req.p_sensor?.serial ?? null,
      battery_pct: bat,
      bpm: blank ? null : (latest?.bpm ?? null),
      contact: blank ? null : (latest?.contact ?? null),
      measured_at: latest ? iso(latest.m) : null,
      connected_at: conn,
      last_seen_at: iso(now),
      is_demo: isDemo,
      updated_at: iso(now),
    };
    hr.live.push(live);
  } else {
    const newer =
      latest &&
      (live.measured_at == null ||
        latest.m > Date.parse(live.measured_at) ||
        live.holder_stream_id !== req.p_stream_id);
    Object.assign(live, {
      rev: Math.max(live.rev + 1, now),
      active_session_id: active?.id ?? null,
      holder_source_id: src.id,
      holder_stream_id: req.p_stream_id,
      holder_name: src.display_name,
      source_kind: req.p_source_kind,
      relay_mode: req.p_mode,
      sensor_name: req.p_sensor?.name ?? live.sensor_name,
      sensor_serial: req.p_sensor?.serial ?? live.sensor_serial,
      battery_pct: bat ?? live.battery_pct,
      measured_at: newer && latest ? iso(latest.m) : live.measured_at,
      bpm: blank ? null : newer && latest ? latest.bpm : live.bpm,
      contact: blank ? null : newer && latest ? latest.contact : live.contact,
      connected_at: conn ?? live.connected_at,
      last_seen_at: iso(now),
      is_demo: isDemo,
      updated_at: iso(now),
    });
  }
  return {
    ...res,
    holder_name: src.display_name,
    stop_requested: !wanted,
    sensor_forgotten: forgotten,
  };
}

/** hr_request(minutes) */
export function mockHrRequest(hr: MockHrDb, uid: string, minutes: number, now: number) {
  const s = hr.sensors.find((x) => x.user_id === uid);
  if (!s) return;
  s.wanted_until = minutes <= 0 ? null : iso(now + Math.min(minutes, 30) * 60_000);
}

/** hr_forget_sensor() */
export function mockForgetSensor(hr: MockHrDb, uid: string, now: number) {
  const s = hr.sensors.find((x) => x.user_id === uid);
  if (s) {
    s.forgotten_at = iso(now);
    s.wanted_until = null;
  }
  const l = hr.live.find((x) => x.user_id === uid);
  if (l) Object.assign(l, { bpm: null, contact: null, rev: Math.max(l.rev + 1, now) });
}

/**
 * A relay tab's hr_live row wins over the simulator while it has been seen in the last 5 min,
 * so closing the relay tab shows Relay offline instead of jumping back to the simulator.
 */
export function relayRowRecent(row: HrLiveRow | null | undefined, now: number): row is HrLiveRow {
  return !!row && now - Date.parse(row.last_seen_at) <= 300_000;
}
