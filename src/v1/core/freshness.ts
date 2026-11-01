// Reading freshness (build-plan D15, handoff 4.5): age <= 10 s live, <= 30 s delayed,
// older unavailable; none when there was never a reading. Age uses server-corrected time.

import { FRESH_LIVE_MS, FRESH_UNAVAILABLE_MS } from "./hr";

export type Freshness = "none" | "live" | "delayed" | "unavailable";

export function freshnessOf(measuredAtMs: number | null, serverNowMs: number): Freshness {
  if (measuredAtMs == null) return "none";
  const age = serverNowMs - measuredAtMs;
  if (age <= FRESH_LIVE_MS) return "live";
  if (age <= FRESH_UNAVAILABLE_MS) return "delayed";
  return "unavailable";
}

export function ageMs(measuredAtMs: number | null, serverNowMs: number): number | null {
  return measuredAtMs == null ? null : Math.max(0, serverNowMs - measuredAtMs);
}

/** Server clock offset estimate from one round trip: server_now - midpoint(send, receive). */
export function offsetSample(
  serverNowMs: number,
  sentLocalMs: number,
  receivedLocalMs: number,
): number {
  return serverNowMs - (sentLocalMs + receivedLocalMs) / 2;
}

/** Median of the last samples (h10-design: median of 3 on load, then of the last 5). */
export function medianOffset(samples: number[]): number {
  if (samples.length === 0) return 0;
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
