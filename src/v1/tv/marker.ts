// The TV session marker (dillan.tv.session): which signed-in Supabase session in this browser
// belongs to a paired TV, and when the TV was last used. Shared by the TV app (boot, auto-lock)
// and the phone layout, which never serves phone routes on a TV's session (the TV token is a
// device-scoped session: no notes editing, no account actions, no un-locking phone UI).

import { AUTO_LOCK_MS } from "./autolock";

export const TV_SESSION_KEY = "dillan.tv.session";

export interface TvMarker {
  userId: string;
  grantId: string | null;
  /** last remote/phone activity (epoch ms): the idle clock survives a reload or Silk restart */
  lastActiveAt?: number;
}

/** Which signed-in Supabase session belongs to this TV (set when the TV paired it). */
export function readMarker(): TvMarker | null {
  try {
    const raw = window.localStorage.getItem(TV_SESSION_KEY);
    const v = raw
      ? (JSON.parse(raw) as { userId?: unknown; grantId?: unknown; lastActiveAt?: unknown })
      : null;
    if (!v || typeof v.userId !== "string") return null;
    return {
      userId: v.userId,
      grantId: typeof v.grantId === "string" ? v.grantId : null,
      ...(typeof v.lastActiveAt === "number" ? { lastActiveAt: v.lastActiveAt } : {}),
    };
  } catch {
    return null;
  }
}

/** Idle past the auto-lock limit according to the persisted activity time. */
export function markerIdleExpired(m: TvMarker, nowMs: number): boolean {
  return m.lastActiveAt != null && nowMs - m.lastActiveAt >= AUTO_LOCK_MS;
}

const MARKER_ACTIVITY_WRITE_MS = 10_000;
let markerWrittenAt = -Infinity;
/** Persist the last activity time (throttled: at most one write every 10 s). */
export function markActivity(userId: string, at: number) {
  if (at - markerWrittenAt < MARKER_ACTIVITY_WRITE_MS) return;
  const m = readMarker();
  if (!m || m.userId !== userId) return;
  markerWrittenAt = at;
  writeMarker({ ...m, lastActiveAt: at });
}

export function writeMarker(v: TvMarker | null) {
  try {
    if (v) window.localStorage.setItem(TV_SESSION_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(TV_SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

/** True when this browser's signed-in session for `userId` is a paired TV's session. */
export function isTvSessionFor(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return readMarker()?.userId === userId;
}
