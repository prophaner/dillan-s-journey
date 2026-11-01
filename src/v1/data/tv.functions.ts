// TV pairing server functions (build-plan D8/D9). The TV is signed out while pairing, so these run
// without the auth middleware and use the service-role client, imported only inside handlers from
// client.server.ts (it never reaches the client bundle). The pairing RPCs they call are granted to
// service_role only (0006).
//
//  tvPairStart(deviceId, label, forUserId?) → new challenge; the TV keeps `secret` in memory, the
//    database stores only sha256(secret) and sha256(code)
//  tvPairStatus(challengeId, secret) → awaiting | approved | denied | expired | cancelled. When
//    approved it consumes the challenge (single use) and mints a one-time magic-link token_hash for
//    the approving user with auth.admin.generateLink; only the caller holding the secret gets it.
//    The TV exchanges it with supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) and then
//    registers its grant (device_grant_register). Nothing secret is ever put in the QR or a URL.
//  tvPairCancel(challengeId, secret)
//
// Phone-only accounts have no email to mint a magic link for: the first TV sign-in gives the auth
// user a non-deliverable placeholder (tv+<uuid>@users.dillan.invalid, confirmed; RFC 2606 .invalid,
// so nothing is ever sent). The app never shows it (supabase-api filters it) and phone OTP keeps
// working. Recorded in docs/v1/build-plan.md (D22).
//
// Abuse limits: 0006 limits codes per device (10 per 10 min), live codes globally (500), wrong
// secrets per challenge (5) and wrong codes per approving user and globally. On top of that, a
// per-IP sliding window here (per server instance), keyed on a trusted address only (clientKey).

import { createServerFn } from "@tanstack/react-start";
import { SlidingWindowLimiter } from "./rate-limit";
import { placeholderEmail } from "@/v1/core/placeholder-email";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = /^[A-Za-z0-9_-]{8,128}$/;
const SECRET = /^[0-9a-f]{64}$/;

/** 20 new codes per address per 10 min (a TV needs one per 5 min). */
const startLimiter = new SlidingWindowLimiter(20, 10 * 60_000);
/** polls every 2 s for 5 min = 150; room for retries and a second TV behind the same NAT */
const pollLimiter = new SlidingWindowLimiter(600, 10 * 60_000);

export type TvPairStatusResult =
  | { ok: true; status: "awaiting" | "denied" | "expired" | "cancelled" | "consumed" }
  | { ok: true; status: "approved"; tokenHash: string }
  | { ok: false; error: string };

export type TvPairStartServerResult =
  | {
      ok: true;
      challenge: { challengeId: string; code: string; expiresAt: string; secret: string };
    }
  | { ok: false; error: "rate_limited" | "unavailable" };

/**
 * The caller's address for the per-IP limit, from trusted sources only (D26): Cloudflare's
 * CF-Connecting-IP (set by the edge, a client cannot forge it through Cloudflare), else the
 * socket address. Never the leftmost X-Forwarded-For: the client writes it, so rotating it would
 * give a fresh budget per request. null when no trusted address exists; then the per-IP layer is
 * skipped (the SQL limits in 0006 still apply) rather than throttling every TV in one bucket.
 */
async function clientKey(): Promise<string | null> {
  try {
    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
    const cf = getRequestHeader("cf-connecting-ip")?.trim();
    if (cf) return `cf:${cf}`;
    const ip = getRequestIP()?.trim();
    return ip ? `ip:${ip}` : null;
  } catch {
    return null;
  }
}

async function overLimit(limiter: SlidingWindowLimiter): Promise<boolean> {
  const key = await clientKey();
  return key !== null && !limiter.take(key);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return hex(new Uint8Array(d));
}

export const tvPairStart = createServerFn({ method: "POST" })
  .validator((input: { deviceId: string; label?: string; forUserId?: string | null }) => {
    if (typeof input?.deviceId !== "string" || !DEVICE.test(input.deviceId))
      throw new Error("invalid_device");
    const label = typeof input.label === "string" ? input.label.trim().slice(0, 60) : "TV";
    const forUserId = input.forUserId ?? null;
    if (forUserId !== null && (typeof forUserId !== "string" || !UUID.test(forUserId)))
      throw new Error("invalid_user");
    return { deviceId: input.deviceId, label: label || "TV", forUserId };
  })
  .handler(async ({ data }): Promise<TvPairStartServerResult> => {
    if (await overLimit(startLimiter)) return { ok: false, error: "rate_limited" };
    const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.rpc("pairing_create", {
      p_device_id: data.deviceId,
      p_secret_hash: await sha256Hex(secret),
      p_device_label: data.label,
      ...(data.forUserId ? { p_for_user_id: data.forUserId } : {}),
    });
    if (res.error) return { ok: false, error: "unavailable" };
    const r = res.data as {
      ok?: boolean;
      error?: string;
      id?: string;
      code?: string;
      expires_at?: string;
    } | null;
    if (!r?.ok || !r.id || !r.code || !r.expires_at)
      return { ok: false, error: r?.error === "rate_limited" ? "rate_limited" : "unavailable" };
    return {
      ok: true,
      challenge: { challengeId: r.id, code: r.code, expiresAt: r.expires_at, secret },
    };
  });

function challengeInput(input: { challengeId: string; secret: string }) {
  if (typeof input?.challengeId !== "string" || !UUID.test(input.challengeId))
    throw new Error("invalid_challenge");
  if (typeof input.secret !== "string" || !SECRET.test(input.secret))
    throw new Error("invalid_secret");
  return { challengeId: input.challengeId, secret: input.secret };
}

export const tvPairStatus = createServerFn({ method: "POST" })
  .validator(challengeInput)
  .handler(async ({ data }): Promise<TvPairStatusResult> => {
    if (await overLimit(pollLimiter)) return { ok: false, error: "rate_limited" };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const st = await admin.rpc("pairing_status", { p_id: data.challengeId, p_secret: data.secret });
    if (st.error) return { ok: false, error: "unavailable" };
    const s = st.data as { ok?: boolean; error?: string; status?: string } | null;
    if (!s?.ok) return { ok: false, error: s?.error ?? "unavailable" };
    if (s.status === "awaiting" || s.status === "denied" || s.status === "expired")
      return { ok: true, status: s.status };
    // Approved and already used (an earlier attempt failed after consuming it): the TV shows
    // "couldn't finish signing in", never "expired".
    if (s.status === "consumed") return { ok: true, status: "consumed" };
    if (s.status !== "approved") return { ok: true, status: "cancelled" };

    // approved → consumed exactly once; the user id never leaves the server
    const c = await admin.rpc("pairing_consume", { p_id: data.challengeId, p_secret: data.secret });
    if (c.error) return { ok: false, error: "unavailable" };
    const consumed = c.data as { ok?: boolean; error?: string; user_id?: string } | null;
    if (!consumed?.ok || !consumed.user_id) {
      if (consumed?.error === "expired") return { ok: true, status: "expired" };
      if (consumed?.error === "already_used") return { ok: true, status: "consumed" };
      return { ok: false, error: consumed?.error ?? "unavailable" };
    }
    // From here the challenge is used up: any failure is final for this code (sign_in_failed),
    // and the TV offers a new one.
    const userId = consumed.user_id;
    const u = await admin.auth.admin.getUserById(userId);
    if (u.error || !u.data.user) return { ok: false, error: "sign_in_failed" };
    let email = u.data.user.email ?? "";
    if (!email) {
      email = placeholderEmail(userId);
      const up = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (up.error) return { ok: false, error: "sign_in_failed" };
    }
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return { ok: false, error: "sign_in_failed" };
    return { ok: true, status: "approved", tokenHash };
  });

export const tvPairCancel = createServerFn({ method: "POST" })
  .validator(challengeInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("pairing_cancel", { p_id: data.challengeId, p_secret: data.secret });
    return { ok: true as const };
  });
