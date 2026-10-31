// The single zone implementation (build-plan D5/D15). Live aggregates and the saved summary both
// call accountZones(); the saved summary stores ALGORITHM_VERSION and the zone snapshot.
//
// Rules
//  - Z1 < b1; Z2 [b1,b2); Z3 [b2,b3); Z4 [b3,b4); Z5 >= b4. No cutoffs => no zone (never guessed).
//  - each eligible sample (bpm != null, contact !== false) holds forward to the next sample
//    (any sample, eligible or not) or 10 s, whichever comes first
//  - holds are intersected with active (unpaused) intervals inside the session
//  - samples are deduplicated by event id (stream_id, seq), sorted by measured_at (out-of-order
//    backfill is fine), and ignored outside [session start, end)
//  - demo samples only count in demo sessions and real samples never count in demo sessions
//  - invariant: sum(zone_ms) + unmeasured_ms = active_ms

import { HOLD_FORWARD_MAX_MS, type StoredSample } from "./hr";
import type { Interval } from "./timing";
import type { ZoneCutoffs } from "./types";

export const ALGORITHM_VERSION = 1;

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

export function validCutoffs(c: readonly number[] | null | undefined): c is ZoneCutoffs {
  return (
    !!c &&
    c.length === 4 &&
    c.every((x) => Number.isInteger(x)) &&
    (c[0] as number) > 0 &&
    (c[0] as number) < (c[1] as number) &&
    (c[1] as number) < (c[2] as number) &&
    (c[2] as number) < (c[3] as number) &&
    (c[3] as number) <= 250
  );
}

export function zoneOf(bpm: number | null, cutoffs: ZoneCutoffs | null): ZoneNumber | null {
  if (bpm == null || !cutoffs) return null;
  const [b1, b2, b3, b4] = cutoffs;
  if (bpm < b1) return 1;
  if (bpm < b2) return 2;
  if (bpm < b3) return 3;
  if (bpm < b4) return 4;
  return 5;
}

/** "Under 114", "114–132", ..., "171+" */
export function zoneRangeLabel(z: ZoneNumber, cutoffs: ZoneCutoffs): string {
  const [a, b, c, d] = cutoffs;
  return [`Under ${a}`, `${a}–${b - 1}`, `${b}–${c - 1}`, `${c}–${d - 1}`, `${d}+`][
    z - 1
  ] as string;
}

export interface ZoneTotals {
  zone_ms: [number, number, number, number, number];
  measured_ms: number;
  unmeasured_ms: number;
  active_ms: number;
  coverage: number; // measured / active, 0..1
}

export interface ZoneAccountingInput {
  samples: StoredSample[];
  /** active (unpaused) intervals, e.g. timing.activeIntervals(session, now) */
  intervals: Interval[];
  cutoffs: ZoneCutoffs | null;
  sessionStart: number;
  sessionEnd: number; // ended_at, or now for live
  sessionIsDemo: boolean;
}

function overlap(a: number, b: number, intervals: Interval[]): number {
  let t = 0;
  for (const i of intervals) {
    const lo = Math.max(a, i.from);
    const hi = Math.min(b, i.to);
    if (hi > lo) t += hi - lo;
  }
  return t;
}

export function accountZones(input: ZoneAccountingInput): ZoneTotals {
  const { cutoffs, sessionStart, sessionEnd } = input;
  const intervals = input.intervals
    .map((i) => ({ from: Math.max(i.from, sessionStart), to: Math.min(i.to, sessionEnd) }))
    .filter((i) => i.to > i.from);
  const active = intervals.reduce((n, i) => n + (i.to - i.from), 0);

  const seen = new Set<string>();
  const samples = input.samples
    .filter((s) => s.is_demo === input.sessionIsDemo)
    .filter((s) => s.measured_at >= sessionStart && s.measured_at < sessionEnd)
    .filter((s) => {
      const id = `${s.stream_id}:${s.seq}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        a.measured_at - b.measured_at || a.stream_id.localeCompare(b.stream_id) || a.seq - b.seq,
    );

  const zone_ms: ZoneTotals["zone_ms"] = [0, 0, 0, 0, 0];
  if (cutoffs) {
    samples.forEach((s, i) => {
      if (s.bpm == null || s.contact === false) return;
      const z = zoneOf(s.bpm, cutoffs);
      if (z == null) return;
      const next = samples[i + 1];
      const end = Math.min(
        next ? next.measured_at : Infinity,
        s.measured_at + HOLD_FORWARD_MAX_MS,
        sessionEnd,
      );
      if (end <= s.measured_at) return;
      zone_ms[z - 1] = (zone_ms[z - 1] ?? 0) + overlap(s.measured_at, end, intervals);
    });
  }
  const measured = zone_ms.reduce((n, x) => n + x, 0);
  return {
    zone_ms,
    measured_ms: measured,
    unmeasured_ms: Math.max(0, active - measured),
    active_ms: active,
    coverage: active > 0 ? measured / active : 0,
  };
}
