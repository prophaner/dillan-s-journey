// Simulated heart rate for the mock backend (dev only, ?mock=1; every screen shows the "Mock data"
// badge). Slice E replaces this with the real relay. The mode lives in localStorage so a tester can
// walk through the health states:
//   localStorage["dillan.mock.hr"] = "live" (default) | "delayed" | "stale" | "waiting" | "off"
// "off" means no strap is paired (H0). Samples are a deterministic function of time, so the live
// dashboard and the finalized summary agree.

import type { HrLiveRow, StoredSample } from "@/v1/core/hr";
import type { WorkoutSessionRow } from "@/v1/core/types";

export const MOCK_HR_KEY = "dillan.mock.hr";
export type MockHrMode = "live" | "delayed" | "stale" | "waiting" | "off";
const MODES: MockHrMode[] = ["live", "delayed", "stale", "waiting", "off"];

export function readMockHrMode(storage: Storage | null): MockHrMode {
  try {
    const v = storage?.getItem(MOCK_HR_KEY) as MockHrMode | null | undefined;
    return v && MODES.includes(v) ? v : "live";
  } catch {
    return "live";
  }
}

/** 90-150 bpm wave: crosses a few zones in a few minutes. */
export function simBpm(t: number): number {
  return Math.round(
    120 + 24 * Math.sin((t / 120_000) * 2 * Math.PI) + 6 * Math.sin((t / 9_000) * 2 * Math.PI),
  );
}

export function mockHrLive(
  userId: string,
  mode: MockHrMode,
  now: number,
  activeSessionId: string | null,
): HrLiveRow | null {
  if (mode === "off") return null;
  const age = mode === "live" ? 1_000 : mode === "delayed" ? 15_000 : 45_000;
  const measured = Math.floor((now - age) / 1000) * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    user_id: userId,
    rev: Math.floor(now / 1000),
    active_session_id: activeSessionId,
    holder_source_id: "00000000-0000-4000-8000-0000000000e1",
    holder_stream_id: "00000000-0000-4000-8000-0000000000e2",
    holder_name: "Mock relay",
    source_kind: "web_ble",
    relay_mode: mode === "waiting" ? "waiting_first" : "live",
    sensor_name: "Polar H10 0000MOCK",
    sensor_serial: "0000MOCK",
    battery_pct: 80,
    bpm: mode === "waiting" ? null : simBpm(measured),
    contact: mode === "waiting" ? null : true,
    measured_at: mode === "waiting" ? null : iso(measured),
    connected_at: iso(now - 600_000),
    last_seen_at: iso(now - 500),
    is_demo: false,
    updated_at: iso(now),
  };
}

/** 1 Hz samples across the session while the simulated strap is live. */
export function mockSamples(row: WorkoutSessionRow, mode: MockHrMode, now: number): StoredSample[] {
  if (!row.live_data || mode !== "live" || !row.started_at) return [];
  const start = Math.ceil(Date.parse(row.started_at) / 1000) * 1000;
  const end = row.ended_at ? Date.parse(row.ended_at) : now;
  const out: StoredSample[] = [];
  for (let t = start; t < end && out.length < 100_000; t += 1000) {
    out.push({
      stream_id: "mock-stream",
      seq: t / 1000,
      measured_at: t,
      bpm: simBpm(t),
      contact: true,
      is_demo: row.is_demo,
    });
  }
  return out;
}
