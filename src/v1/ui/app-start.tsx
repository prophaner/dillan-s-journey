// Signed-in app start (F6 interruption recovery):
//  - an unfinished active/paused session sends the user back to it once per page load (reload or
//    a fresh tab never ends a workout; Back from the dashboard is still allowed afterwards)
//  - queued session commands of this user are replayed (only this user's: command-queue.ts)
//  - notes kept on this device are retried now and whenever the browser comes back online

import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { DillanApi } from "@/v1/data/api";
import { useApi } from "@/v1/data/client";
import { qk, useCurrentSession } from "@/v1/data/queries";
import { queuedSessionIds } from "@/v1/session/command-queue";
import { SessionController, hasForegroundController } from "@/v1/session/controller";
import { retryPendingNotes } from "@/v1/session/notes";
import { serverClockFor } from "@/v1/session/server-clock";
import { deviceSource } from "@/v1/session/use-session";

let recoveredFor: string | null = null;

/** Tests reset the once-per-load recovery flag. */
export function resetRecoveryForTests() {
  recoveredFor = null;
}

/**
 * Replays queued commands for sessions that are not open on screen. A session whose page
 * controller is mounted is skipped (it pumps its own queue); if the page mounts while a replay
 * runs, the page controller takes over and the replay controller stops (controller.ts).
 */
export async function replayQueuedCommands(
  api: DillanApi,
  userId: string,
  skip: string | null,
): Promise<void> {
  const clock = serverClockFor(api.hr);
  for (const id of queuedSessionIds(userId)) {
    if (id === skip || hasForegroundController(userId, id)) continue;
    const c = new SessionController({
      api,
      userId,
      sessionId: id,
      source: deviceSource(),
      now: () => clock.now(),
      listenWindow: false,
    });
    try {
      await c.start();
    } finally {
      c.dispose();
    }
  }
}

/**
 * Does the one-time "running workout" recovery on a fresh load take this path to the session?
 * Not when it is already the session, and not for an explicit deep link: a scanned TV pairing QR
 * (/approve-tv?code=…) must reach S03 while its 5-minute code runs (the running-workout banner
 * still shows there).
 */
export function recoveryRedirects(path: string): boolean {
  return !path.startsWith("/session/") && !path.startsWith("/approve-tv");
}

export function AppStart({ userId }: { userId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = useCurrentSession(userId);
  // The live path, read when replay runs (the effect below is not re-run on navigation).
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    const row = current.data;
    if (!current.isSuccess || recoveredFor === userId) return;
    recoveredFor = userId;
    if (!row || (row.state !== "active" && row.state !== "paused")) return;
    if (!recoveryRedirects(path)) return;
    void navigate({ to: "/session/$id", params: { id: row.id } });
  }, [current.isSuccess, current.data, userId, path, navigate]);

  useEffect(() => {
    const run = () => {
      const at = pathRef.current;
      const open = at.startsWith("/session/") ? at.slice("/session/".length) : null;
      void retryPendingNotes(api, userId).then((n) => {
        if (n > 0) void qc.invalidateQueries({ queryKey: ["v1", userId] });
      });
      void replayQueuedCommands(api, userId, open).then(() =>
        qc.invalidateQueries({ queryKey: qk.current(userId) }),
      );
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
    // Once per user, not on every navigation (run() reads the live path).
  }, [api, userId, qc]);

  return null;
}
