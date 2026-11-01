// This TV's identity and its remembered chooser profiles (build-plan D17, handoff §1/§6).
//  - device id: random, kept in localStorage; bound to every pairing challenge and grant
//  - remembered profiles: opt-in, { userId, firstName } only (+ when last active, for the chooser's
//    initial focus). Not authorization: choosing a tile still needs approval on that phone.
// Nothing else about a user is ever stored on the TV; user data lives in memory and is cleared on
// lock (lock.ts).

import { newId, type TvDeviceInfo } from "@/v1/data/api";

export const TV_DEVICE_KEY = "dillan.tv.device";
export const TV_PROFILES_KEY = "dillan.tv.profiles";
export const MAX_REMEMBERED = 6;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RememberedProfile {
  userId: string;
  firstName: string;
  lastActiveAt: number;
}

function safeStorage(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function defaultLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  // Fire TV models report "AFT…" in the user agent; Silk is Amazon's browser.
  return /\bAFT[A-Z0-9]*\b/.test(ua) || /Silk\//.test(ua) ? "Fire TV" : "TV browser";
}

export function tvDevice(store: Store | null = safeStorage()): TvDeviceInfo {
  try {
    const raw = store?.getItem(TV_DEVICE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<TvDeviceInfo>) : null;
    if (v && typeof v.id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(v.id))
      return { id: v.id, label: typeof v.label === "string" && v.label ? v.label : "TV" };
  } catch {
    /* fall through: a new id */
  }
  const d = { id: `tv-${newId()}`, label: defaultLabel() };
  try {
    store?.setItem(TV_DEVICE_KEY, JSON.stringify(d));
  } catch {
    /* private mode: this id lives for the page only */
  }
  return d;
}

/** First word of the display name, max 20 characters (handoff: first names only). */
export function firstNameOf(displayName: string): string {
  return (displayName.trim().split(/\s+/)[0] ?? "").slice(0, 20);
}

export function rememberedProfiles(store: Store | null = safeStorage()): RememberedProfile[] {
  try {
    const raw = store?.getItem(TV_PROFILES_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (p): p is RememberedProfile =>
          !!p &&
          typeof p.userId === "string" &&
          typeof p.firstName === "string" &&
          typeof p.lastActiveAt === "number",
      )
      .map((p) => ({ userId: p.userId, firstName: p.firstName, lastActiveAt: p.lastActiveAt }))
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  } catch {
    return [];
  }
}

function write(list: RememberedProfile[], store: Store | null) {
  try {
    if (list.length) store?.setItem(TV_PROFILES_KEY, JSON.stringify(list));
    else store?.removeItem(TV_PROFILES_KEY);
  } catch {
    /* storage blocked */
  }
}

export function isRemembered(userId: string, store: Store | null = safeStorage()): boolean {
  return rememberedProfiles(store).some((p) => p.userId === userId);
}

/** Opt in (or refresh the name / last-active time of) a remembered profile. */
export function rememberProfile(
  userId: string,
  displayName: string,
  at = Date.now(),
  store: Store | null = safeStorage(),
) {
  const firstName = firstNameOf(displayName);
  if (!firstName) return;
  const rest = rememberedProfiles(store).filter((p) => p.userId !== userId);
  write([{ userId, firstName, lastActiveAt: at }, ...rest].slice(0, MAX_REMEMBERED), store);
}

/** Only refreshes an already remembered profile (never opts anyone in). */
export function touchProfile(
  userId: string,
  displayName: string | null,
  at = Date.now(),
  store: Store | null = safeStorage(),
) {
  const list = rememberedProfiles(store);
  const p = list.find((x) => x.userId === userId);
  if (!p) return;
  p.lastActiveAt = at;
  if (displayName && firstNameOf(displayName)) p.firstName = firstNameOf(displayName);
  write(list, store);
}

export function forgetProfile(userId: string, store: Store | null = safeStorage()) {
  write(
    rememberedProfiles(store).filter((p) => p.userId !== userId),
    store,
  );
}
