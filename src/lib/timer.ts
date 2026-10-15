import { useEffect, useState } from "react";

/** Timers are derived from stored timestamps, never from tick counts (05-web-platform §4). */
export function elapsedMs(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

export function remainingMs(startedAt: number, durationMs: number, now: number): number {
  return Math.max(0, startedAt + durationMs - now);
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Re-render on an interval; the value is always read fresh from the clock. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return now;
}

/** Keep the screen awake while mounted; re-request when the page becomes visible again. */
export function useWakeLock(active: boolean): "on" | "unavailable" | "off" {
  const [state, setState] = useState<"on" | "unavailable" | "off">("off");
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) {
      setState("unavailable");
      return;
    }
    let sentinel: Sentinel | null = null;
    const request = async () => {
      try {
        sentinel = await nav.wakeLock!.request("screen");
        setState("on");
      } catch {
        setState("unavailable");
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [active]);
  return state;
}
