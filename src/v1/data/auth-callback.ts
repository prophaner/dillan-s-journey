// Email sign-in link landing. The default Lovable Cloud email has only a "Log In" link (no code),
// so the link must finish sign-in on its own. The Supabase client uses the implicit flow: the
// link lands on <origin>/auth?redirect=...#access_token=...&refresh_token=... (or #error_code=...).
//
// We read and strip those params ourselves, before the Supabase client first initializes (it is
// created lazily on first use), so that:
//  - the tokens never stay in the address bar or the router's location;
//  - a browser holding the TV marker never turns into a phone session from a link (the session
//    storage is shared with /tv, so letting supabase-js adopt it would replace the TV session);
//  - link errors (expired / already used) become a friendly message, never raw provider text;
//  - a link this browser did not ask for is never adopted silently (login CSRF / session
//    fixation: the implicit flow has no PKCE verifier binding the link to the requesting browser).
//    It is adopted only when this browser has a pending request for the same email, or it is for
//    the account already signed in here; otherwise the person confirms "Continue as <email>?".
// The TV pairing flow (token_hash + verifyOtp on /tv) never puts tokens in the URL: unaffected.

import type { AuthResult, AuthUser, DillanApi } from "./api";
import { readMarker } from "@/v1/tv/marker";
import { safeRedirect } from "@/v1/ui/redirect";

/** The fixed route every email link returns to. */
export const AUTH_CALLBACK_PATH = "/auth";

/** Mock (?mock=1) link tokens are this prefix plus the email; real ones are GoTrue JWTs. */
export const MOCK_LINK_PREFIX = "mock-link:";

/**
 * emailRedirectTo for signInWithOtp: the current origin, the fixed /auth path and, when there is
 * one, the return target (re-checked with safeRedirect, so only a same-origin path). The target
 * rides in the link itself because the email app may open it in another browser context
 * (Gmail/Outlook in-app browser, Safari vs Chrome) that has no localStorage from this one.
 */
export function emailRedirectUrl(origin: string, returnTo?: string | null): string {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  const target = safeRedirect(returnTo);
  if (target !== "/") url.searchParams.set("redirect", target);
  return url.toString();
}

export type LinkErrorKind = "expired" | "invalid" | "tv_device" | "network";

export type AuthCallback =
  | { kind: "none" }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; error: LinkErrorKind };

export type LinkOutcome =
  | { kind: "signed_in" }
  /** `email` comes only from the link's own token, never from this browser's storage. */
  | { kind: "error"; error: LinkErrorKind; email?: string };

/** A link waiting on the person: confirm an unexpected one, or retry after a network error. */
export interface PendingLink {
  reason: "confirm" | "retry";
  email: string;
  /** confirm only: another account is signed in on this browser and would be replaced */
  switching: boolean;
}

/** Params Supabase Auth adds to a redirect; all are removed from the address bar. */
const CALLBACK_PARAMS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "type",
  "provider_token",
  "provider_refresh_token",
  "error",
  "error_code",
  "error_description",
  "sb",
];

/** How long getApi() (and so the first paint) may wait on each auth call while settling a link. */
export const SETTLE_TIMEOUT_MS = 10_000;

function hashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

function isCallback(p: URLSearchParams): boolean {
  return p.has("access_token") || p.has("error_code") || p.has("error_description");
}

/** Pure: what an incoming URL carries. Raw provider text is never kept, only a known kind. */
export function parseAuthCallback(href: string): AuthCallback {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none" };
  }
  const h = hashParams(url);
  const q = url.searchParams;
  const errParams = h.has("error_code") || h.has("error_description") ? h : q;
  if (errParams.has("error_code") || errParams.has("error_description")) {
    const code = errParams.get("error_code") ?? "";
    return { kind: "error", error: code === "otp_expired" ? "expired" : "invalid" };
  }
  const access = h.get("access_token");
  const refresh = h.get("refresh_token");
  if (access && refresh) return { kind: "tokens", accessToken: access, refreshToken: refresh };
  if (access) return { kind: "error", error: "invalid" };
  return { kind: "none" };
}

/** Pure: the same URL without any Supabase callback params (and without an empty "#"). */
export function stripAuthCallback(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const h = hashParams(url);
  if (isCallback(h)) {
    CALLBACK_PARAMS.forEach((k) => h.delete(k));
    const rest = h.toString();
    url.hash = rest ? `#${rest}` : "";
  }
  const q = url.searchParams;
  if (q.has("error_code") || q.has("error_description")) {
    CALLBACK_PARAMS.forEach((k) => q.delete(k));
  }
  return url.toString().replace(/#$/, "");
}

/**
 * Pure: who a link's access token is for. Unverified claims, used only to decide whether to ask
 * before adopting; the server still validates the token in setSession.
 */
export function linkTokenIdentity(
  accessToken: string,
): { email: string; sub: string | null } | null {
  if (accessToken.startsWith(MOCK_LINK_PREFIX)) {
    const email = accessToken.slice(MOCK_LINK_PREFIX.length).trim().toLowerCase();
    return email ? { email, sub: null } : null;
  }
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json) as { email?: unknown; sub?: unknown };
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email) return null;
    return { email, sub: typeof claims.sub === "string" ? claims.sub : null };
  } catch {
    return null;
  }
}

function sameEmail(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b;
}

let captured: AuthCallback | null = null;
let outcome: LinkOutcome | null = null;
let pending: (PendingLink & { accessToken: string; refreshToken: string }) | null = null;

/**
 * Reads the callback params from the address bar once and strips them (history.replaceState).
 * Runs at import of the data client (before the router reads the location and before the
 * Supabase client exists) and again, idempotently, in getApi().
 */
export function captureAuthCallback(): void {
  if (captured || typeof window === "undefined") return;
  const href = window.location.href;
  captured = parseAuthCallback(href);
  if (captured.kind === "none") return;
  const clean = stripAuthCallback(href);
  if (clean !== href) {
    try {
      window.history.replaceState(window.history.state, "", clean);
    } catch {
      /* sandboxed frame: nothing else to do */
    }
  }
}

/**
 * Finishes a captured link sign-in with the chosen backend (once per page load). A browser that
 * holds the TV marker never adopts a link session; a link this browser did not request (or for
 * another account than the one signed in here) waits for the person to confirm it.
 */
export async function settleAuthCallback(api: DillanApi): Promise<void> {
  captureAuthCallback();
  const cb = captured;
  if (!cb || cb.kind === "none") return;
  captured = { kind: "none" };
  if (cb.kind === "error") {
    outcome = cb;
    return;
  }
  const id = linkTokenIdentity(cb.accessToken);
  // The TV surface and any browser paired as a TV share one auth storage with the phone routes.
  if (readMarker() || isTvPath(window.location.pathname)) {
    outcome = { kind: "error", error: "tv_device", ...(id ? { email: id.email } : {}) };
    return;
  }
  if (!id) {
    outcome = { kind: "error", error: "invalid" };
    return;
  }
  const current: AuthUser | null = await withTimeout(
    api.auth.getUser().catch(() => null),
    SETTLE_TIMEOUT_MS,
    null,
  );
  const isCurrent =
    !!current && (id.sub ? current.id === id.sub : sameEmail(current.email, id.email));
  const request = readLinkRequest();
  const expected = !current && !!request && sameEmail(request.email, id.email);
  pending = {
    reason: "confirm",
    email: id.email,
    switching: !!current && !isCurrent,
    accessToken: cb.accessToken,
    refreshToken: cb.refreshToken,
  };
  if (expected || isCurrent) await adoptPending(api);
}

async function adoptPending(api: DillanApi): Promise<void> {
  const p = pending;
  if (!p) return;
  const network = { ok: false as const, error: "network" as const };
  const r: AuthResult<{ user: AuthUser }> = await withTimeout(
    api.auth
      .signInWithLink({ accessToken: p.accessToken, refreshToken: p.refreshToken })
      .catch(() => network),
    SETTLE_TIMEOUT_MS,
    network,
  );
  if (r.ok) {
    pending = null;
    outcome = { kind: "signed_in" };
  } else if (r.error === "network") {
    // The link is probably still valid: keep it for "Try again" instead of asking for a new one.
    pending = { ...p, reason: "retry", switching: false };
  } else {
    pending = null;
    outcome = { kind: "error", error: "invalid", email: p.email };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

function isTvPath(path: string): boolean {
  return path === "/tv" || path.startsWith("/tv/");
}

/** The link outcome of this page load, once (the /auth route shows it). */
export function takeLinkOutcome(): LinkOutcome | null {
  const o = outcome;
  outcome = null;
  return o;
}

/** A link waiting on the person (kept across router.invalidate, gone on reload). */
export function pendingLink(): PendingLink | null {
  return pending
    ? { reason: pending.reason, email: pending.email, switching: pending.switching }
    : null;
}

/** The person confirmed (or retries) the pending link; the result is then in takeLinkOutcome. */
export async function confirmPendingLink(api: DillanApi): Promise<void> {
  await adoptPending(api);
}

/** The person declined the pending link ("Not me" / "Send a new link"). */
export function dropPendingLink(): void {
  pending = null;
}

// ---- What was requested, so the tab the link opens in can continue where the person was ----

const LINK_REQUEST_KEY = "dillan.auth.linkRequest";
/** About the default link lifetime (Lovable Auth "Email OTP expiration", 3600 s). */
export const LINK_REQUEST_TTL_MS = 60 * 60 * 1000;

export interface LinkRequest {
  email: string;
  /** a same-origin path; always re-checked with safeRedirect before use */
  returnTo: string | null;
}

export function rememberLinkRequest(req: LinkRequest, nowMs = Date.now()): void {
  try {
    window.localStorage.setItem(
      LINK_REQUEST_KEY,
      JSON.stringify({ ...req, email: req.email.trim().toLowerCase(), at: nowMs }),
    );
  } catch {
    /* storage blocked: the link still signs in after a confirmation, landing on its ?redirect= */
  }
}

/** Never shown on screen: it would reveal the last email requested on a shared browser. */
export function readLinkRequest(nowMs = Date.now()): LinkRequest | null {
  try {
    const raw = window.localStorage.getItem(LINK_REQUEST_KEY);
    const v = raw
      ? (JSON.parse(raw) as { email?: unknown; returnTo?: unknown; at?: unknown })
      : null;
    if (!v || typeof v.email !== "string" || typeof v.at !== "number") return null;
    if (nowMs - v.at > LINK_REQUEST_TTL_MS || v.at > nowMs + 60_000) {
      clearLinkRequest();
      return null;
    }
    return { email: v.email, returnTo: typeof v.returnTo === "string" ? v.returnTo : null };
  } catch {
    return null;
  }
}

export function clearLinkRequest(): void {
  try {
    window.localStorage.removeItem(LINK_REQUEST_KEY);
  } catch {
    /* ignore */
  }
}

/** Tests only. */
export function resetAuthCallbackForTests(): void {
  captured = null;
  outcome = null;
  pending = null;
}
