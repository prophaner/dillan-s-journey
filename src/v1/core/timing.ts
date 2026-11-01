// Timers derive from stored timestamps, never from ticks (brief: clients interpolate).
// All inputs and outputs are epoch ms.

import type { EngineState } from "./types";

type TimingInput = Pick<
  EngineState,
  | "state"
  | "started_at"
  | "ended_at"
  | "paused_at"
  | "paused_ms"
  | "pauses"
  | "rest_started_at"
  | "rest_ends_at"
>;

/** The instant timing stops: ended_at once ended, else now. */
function clockEnd(s: TimingInput, now: number): number {
  return s.ended_at ?? now;
}

/** Wall time from start to end (or now). 0 before start. */
export function elapsedMs(s: TimingInput, now: number): number {
  if (s.started_at == null) return 0;
  return Math.max(0, clockEnd(s, now) - s.started_at);
}

/** Active time = elapsed minus closed pauses minus the open pause. */
export function activeMs(s: TimingInput, now: number): number {
  if (s.started_at == null) return 0;
  const end = clockEnd(s, now);
  const open = s.paused_at != null && s.ended_at == null ? Math.max(0, end - s.paused_at) : 0;
  return Math.max(0, end - s.started_at - s.paused_ms - open);
}

/** Rest remaining; frozen while paused. null when no rest is running. */
export function restRemainingMs(s: TimingInput, now: number): number | null {
  if (s.rest_ends_at == null) return null;
  const ref = s.state === "paused" && s.paused_at != null ? s.paused_at : now;
  return Math.max(0, s.rest_ends_at - ref);
}

/** True when the rest countdown reached zero ("Rest finished"; no auto-advance). */
export function restFinished(s: TimingInput, now: number): boolean {
  const r = restRemainingMs(s, now);
  return r != null && r === 0;
}

export interface Interval {
  from: number;
  to: number;
}

/** Active (unpaused) intervals between start and end/now. Used by zone accounting. */
export function activeIntervals(s: TimingInput, now: number): Interval[] {
  if (s.started_at == null) return [];
  const end = clockEnd(s, now);
  const out: Interval[] = [];
  let cursor = s.started_at;
  const pauses = [...s.pauses].sort((a, b) => a.from - b.from);
  for (const p of pauses) {
    const pFrom = Math.max(p.from, s.started_at);
    const pTo = Math.min(p.to ?? end, end);
    if (pFrom > cursor) out.push({ from: cursor, to: Math.min(pFrom, end) });
    cursor = Math.max(cursor, pTo);
    if (cursor >= end) break;
  }
  if (cursor < end) out.push({ from: cursor, to: end });
  return out.filter((i) => i.to > i.from);
}

/** "12:34" or "1:02:03" */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + ":" + String(sec).padStart(2, "0");
}
