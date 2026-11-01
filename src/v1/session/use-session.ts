// React bindings for the session engine client: the controller per session, the server clock,
// a 1 s tick for timers, the device source and the screen wake lock.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CommandSource, WorkoutSessionRow } from "@/v1/core/types";
import { useApi } from "@/v1/data/client";
import { SessionController, type SessionView } from "./controller";
import { serverClockFor, type ServerClock } from "./server-clock";

export function useServerClock(): ServerClock {
  const api = useApi();
  return useMemo(() => serverClockFor(api.hr), [api]);
}

/** Server-corrected now, re-rendered every `ms` (timers interpolate from stored timestamps). */
export function useNow(ms = 1000): number {
  const clock = useServerClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const t = setInterval(() => setNow(clock.now()), ms);
    return () => clearInterval(t);
  }, [clock, ms]);
  return now;
}

/** 'phone' on touch-first screens, else 'desktop' (session_command source). */
export function deviceSource(): CommandSource {
  try {
    return window.matchMedia("(pointer: coarse)").matches ? "phone" : "desktop";
  } catch {
    return "phone";
  }
}

export function useSessionController(
  sessionId: string,
  userId: string,
  /** default: deviceSource(); the TV passes "tv" */
  source?: CommandSource,
  /** where the command queue persists (default localStorage; the TV passes memory only) */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
  /** backstop re-read interval (the TV passes one; see ControllerOptions.pollMs) */
  pollMs?: number,
): { view: SessionView; controller: SessionController } {
  const api = useApi();
  const clock = useServerClock();
  const qc = useQueryClient();
  const controller = useMemo(
    () =>
      new SessionController({
        api,
        userId,
        sessionId,
        source: source ?? deviceSource(),
        ...(storage !== undefined ? { storage } : {}),
        now: () => clock.now(),
        ...(pollMs ? { pollMs } : {}),
        onEnded: (row: WorkoutSessionRow) => {
          // The client that ended the session finalizes its heart-rate summary.
          if (row.live_data) void api.sessions.finalize(row.id).catch(() => undefined);
          void qc.invalidateQueries({ queryKey: ["v1", userId] });
        },
      }),
    [api, userId, sessionId, clock, qc, source, storage, pollMs],
  );
  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { view, controller };
}

type WakeLockSentinelLike = { release(): Promise<void>; released?: boolean };

/** Keep the screen on while `on` (active/paused workout), where the browser supports it. */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || typeof navigator === "undefined") return;
    const wl = (
      navigator as Navigator & {
        wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!wl) return;
    let lock: WakeLockSentinelLike | null = null;
    let live = true;
    const get = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const l = await wl.request("screen");
        if (live) lock = l;
        else void l.release();
      } catch {
        /* denied (battery saver, not visible): the workout still runs */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) void get();
    };
    void get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}
