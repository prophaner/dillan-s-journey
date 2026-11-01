// TV screens (handoff §3 table) and what Back does on each. Pure: the app applies the action.
// The TV keeps its own screen state at /tv instead of URL routes: Back is app-defined per screen
// and Silk may deliver Back as a history popstate, so the URL never changes while the TV runs.

import type { SessionStateName } from "@/v1/core/types";

export type TvScreen =
  | { name: "first_run" }
  | { name: "chooser" }
  | { name: "pairing"; forUserId: string | null }
  | { name: "home" }
  | { name: "program" }
  | { name: "choose" }
  | { name: "preflight"; templateId: string }
  | { name: "session"; sessionId: string }
  | { name: "calendar"; month?: string; day?: string }
  | { name: "detail"; sessionId: string; day?: string }
  | { name: "profile" }
  | { name: "live_data" };

export type TvModal =
  | { kind: "end" } // M3
  | { kind: "running"; then: "switch" | "lock" | "remove" } // M4
  | { kind: "lock" } // M5
  | { kind: "remove" } // M6
  | { kind: "zones" } // All zones sheet
  | { kind: "hr" } // S09 Heart rate sheet (h10-design 6)
  | { kind: "relay_qr" }; // S04/S08 relay QR, full screen

export type BackAction =
  /** return false to the shell: it may exit the app */
  | { kind: "exit" }
  /** Home without a workout: tell the user Back exits, then return false */
  | { kind: "exit_toast" }
  | { kind: "go"; screen: TvScreen }
  | { kind: "pause" }
  | { kind: "noop" }
  | { kind: "close_modal" }
  | { kind: "cancel_pairing" };

export interface BackContext {
  modal: TvModal | null;
  /** state of the session on the session screen (null while loading) */
  sessionState?: SessionStateName | null;
  /** the signed-in user's unfinished session (active/paused), if any */
  liveSessionId?: string | null;
}

export const EXIT_TOAST =
  "On Fire TV, Back here exits Dillan. You stay signed in and the TV auto-locks after 15 minutes.";

export function backFor(screen: TvScreen, ctx: BackContext): BackAction {
  // Every modal closes with Back as its safe action (M3 = Keep going, M4/M5/M6 = Cancel).
  if (ctx.modal) return { kind: "close_modal" };
  switch (screen.name) {
    case "first_run":
    case "chooser":
      return { kind: "exit" };
    case "pairing":
      return { kind: "cancel_pairing" };
    case "home":
      return ctx.liveSessionId
        ? { kind: "go", screen: { name: "session", sessionId: ctx.liveSessionId } }
        : { kind: "exit_toast" };
    case "program":
    case "choose":
    case "calendar":
    case "profile":
      return { kind: "go", screen: { name: "home" } };
    case "live_data":
      return { kind: "go", screen: { name: "profile" } };
    case "preflight":
      return { kind: "go", screen: { name: "choose" } };
    case "session":
      if (ctx.sessionState === "active") return { kind: "pause" };
      // Paused overlay: Back keeps it paused (acceptance 22).
      if (ctx.sessionState === "paused" || ctx.sessionState === "ending") return { kind: "noop" };
      if (ctx.sessionState === "ended") return { kind: "go", screen: { name: "calendar" } };
      return { kind: "go", screen: { name: "home" } };
    case "detail":
      return {
        kind: "go",
        screen: {
          name: "calendar",
          ...(screen.day ? { day: screen.day, month: screen.day.slice(0, 7) } : {}),
        },
      };
  }
}

/** Stable key for [data-screen] (focus engine: a new key gets initial focus). */
export function screenKey(s: TvScreen): string {
  switch (s.name) {
    case "preflight":
      return `preflight:${s.templateId}`;
    case "session":
      return `session:${s.sessionId}`;
    case "detail":
      return `detail:${s.sessionId}`;
    case "pairing":
      return `pairing:${s.forUserId ?? ""}`;
    default:
      return s.name;
  }
}

/**
 * Backstop re-read of the current session on the TV. Realtime re-reads on every channel rejoin;
 * this catches anything still missed (a visible Fire TV fires no online/focus event on a blip).
 */
export const TV_SESSION_POLL_MS = 45_000;
