// Summary finalization (h10-design 5.4): the saved zone totals of an ended session, computed from
// its stored samples with the single zone implementation (zones.ts). Shared by the server function
// (src/v1/data/finalize.functions.ts) and the mock backend. Pure.

import type { StoredSample } from "./hr";
import { activeIntervals } from "./timing";
import { engineStateFromRow, type SessionSummaryRow, type WorkoutSessionRow } from "./types";
import { accountZones, ALGORITHM_VERSION, validCutoffs } from "./zones";

/** Pending after End, or final but marked dirty by late samples within the grace window. */
export function needsFinalize(s: Pick<SessionSummaryRow, "hr_status" | "hr_finalize_dirty">) {
  return s.hr_status === "pending" || (s.hr_status === "final" && s.hr_finalize_dirty);
}

export interface FinalizeTotals {
  zone_ms: [number, number, number, number, number];
  unmeasured_ms: number;
  measured_ms: number;
  coverage: number;
  algorithm_version: number;
}

/**
 * Zone totals for an ended session. `summaryActiveMs` is the active time the End command saved;
 * Unmeasured is derived from it so sum(zone_ms) + unmeasured_ms = active_ms holds exactly, as
 * session_hr_finalize requires. Returns null for a session that has not ended.
 */
export function finalizeTotals(
  row: WorkoutSessionRow,
  samples: StoredSample[],
  summaryActiveMs: number,
): FinalizeTotals | null {
  if (row.state !== "ended" || !row.started_at || !row.ended_at) return null;
  const s = engineStateFromRow(row);
  const start = s.started_at as number;
  const end = s.ended_at as number;
  const c = row.zone_snapshot?.cutoffs;
  const cutoffs = validCutoffs(c) ? c : null;
  const t = accountZones({
    samples,
    intervals: activeIntervals(s, end),
    cutoffs,
    sessionStart: start,
    sessionEnd: end,
    sessionIsDemo: row.is_demo,
  });
  const zone_ms = t.zone_ms.map((x) => Math.round(x)) as FinalizeTotals["zone_ms"];
  let measured = zone_ms.reduce((n, x) => n + x, 0);
  // Rounding or a pause recorded a few ms differently must never make measured exceed active.
  if (measured > summaryActiveMs) {
    const scale = summaryActiveMs / measured;
    for (let i = 0; i < 5; i++) zone_ms[i] = Math.floor((zone_ms[i] as number) * scale);
    measured = zone_ms.reduce((n, x) => n + x, 0);
  }
  return {
    zone_ms,
    measured_ms: measured,
    unmeasured_ms: Math.max(0, summaryActiveMs - measured),
    coverage: summaryActiveMs > 0 ? Math.min(1, measured / summaryActiveMs) : 0,
    algorithm_version: ALGORITHM_VERSION,
  };
}
