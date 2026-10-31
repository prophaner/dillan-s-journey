// DillanApi on Supabase: Slice A tables/RPCs (drizzle/migrations/0006_v1_core.sql) and Realtime
// postgres_changes filtered by user (D6). Writes with business rules go through RPCs; templates
// and zone_configs are written directly under RLS with an optimistic revision/version check.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { HrLiveRow, StoredSample } from "@/v1/core/hr";
import type {
  DeviceGrantRow,
  SessionNoteRow,
  SessionRpcResult,
  SessionSummaryRow,
  TemplateBody,
  Unit,
  WorkoutSessionRow,
  WorkoutTemplate,
  ZoneConfig,
} from "@/v1/core/types";
import {
  newId,
  RevisionConflictError,
  TemplateInvalidError,
  type AuthErrorCode,
  type AuthUser,
  type DillanApi,
  type HistoryItem,
  type NoteSaveResult,
  type PairingError,
  type PairingPreview,
  type PairingResult,
  type Profile,
  type ProfilePatch,
} from "./api";

type AnyError =
  | {
      code?: string | undefined;
      status?: number | undefined;
      message?: string | undefined;
      name?: string | undefined;
    }
  | null
  | undefined;

/** Map a Supabase Auth error to a code that never reveals whether an account exists. */
export function authErrorCode(e: AnyError, channel: "email" | "sms"): AuthErrorCode {
  if (!e) return "unknown";
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (e.name === "AuthRetryableFetchError" || msg.includes("failed to fetch")) return "network";
  if (
    channel === "sms" &&
    (code === "phone_provider_disabled" ||
      msg.includes("unsupported phone provider") ||
      msg.includes("phone provider") ||
      msg.includes("sms provider"))
  )
    return "sms_not_configured";
  if (e.status === 429 || code.startsWith("over_") || msg.includes("rate limit"))
    return "rate_limited";
  // Explicit contact codes first: their messages also contain "invalid"
  // ('Email address "x" is invalid', "Invalid phone number format (E.164 required)").
  if (
    code === "validation_failed" ||
    code === "email_address_invalid" ||
    code === "sms_send_failed" ||
    msg.includes("email address") ||
    msg.includes("phone number") ||
    msg.includes("invalid format")
  )
    return "invalid_contact";
  if (
    code === "otp_expired" ||
    code === "invalid_credentials" ||
    msg.includes("token has expired") ||
    msg.includes("invalid")
  )
    return "invalid_code";
  return "unknown";
}

function toUser(
  u: { id: string; email?: string | null; phone?: string | null } | null | undefined,
): AuthUser | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email || null,
    phone: u.phone ? (u.phone.startsWith("+") ? u.phone : `+${u.phone}`) : null,
  };
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("not_authenticated");
  return id;
}

function check<T>(res: { data: T; error: AnyError }): T {
  if (res.error)
    throw Object.assign(new Error(res.error.message ?? "request_failed"), { code: res.error.code });
  return res.data;
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  timezone: string;
  weight_unit: string;
  weekly_goal: number;
  preferences: Json;
  version: number;
};

function prefsOf(p: Json): Record<string, unknown> {
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

function toProfile(r: ProfileRow): Profile {
  const prefs = prefsOf(r.preferences);
  const units = prefs["units"] as { weight?: string } | undefined;
  const w = units?.weight === "kg" || units?.weight === "lb" ? units.weight : r.weight_unit;
  return {
    id: r.id,
    display_name: r.display_name ?? "",
    timezone: r.timezone,
    weight_unit: (w === "kg" ? "kg" : "lb") as Unit,
    weekly_goal: r.weekly_goal ?? 3,
    needs_name: prefs["v1_name_done"] !== true || !(r.display_name ?? "").trim(),
    version: r.version,
  };
}

const PROFILE_COLS = "id, display_name, timezone, weight_unit, weekly_goal, preferences, version";

function asTemplate(r: unknown): WorkoutTemplate {
  return r as WorkoutTemplate;
}

function parseInvalid(e: AnyError & { details?: string }): TemplateInvalidError | null {
  if (!e || !(e.message ?? "").includes("invalid_template")) return null;
  try {
    return new TemplateInvalidError(JSON.parse(e.details ?? "[]"));
  } catch {
    return new TemplateInvalidError([]);
  }
}

type SummaryJoin = SessionSummaryRow & {
  workout_sessions: { snapshot: { name?: string } | null; template_id: string | null } | null;
};

async function withNotes(rows: SummaryJoin[]): Promise<HistoryItem[]> {
  const ids = rows.map((r) => r.session_id);
  const noted = new Set<string>();
  if (ids.length) {
    const { data } = await supabase
      .from("session_notes")
      .select("session_id, text")
      .in("session_id", ids);
    for (const n of data ?? []) if ((n.text ?? "").trim()) noted.add(n.session_id);
  }
  return rows.map(({ workout_sessions: ws, ...s }) => ({
    ...(s as SessionSummaryRow),
    name: ws?.snapshot?.name ?? "Workout",
    template_id: ws?.template_id ?? null,
    has_note: noted.has(s.session_id),
  }));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function createSupabaseApi(): DillanApi {
  const api: DillanApi = {
    kind: "supabase",

    auth: {
      async getUser() {
        const { data, error } = await supabase.auth.getUser();
        if (data.user) return toUser(data.user);
        // Offline: trust the session on this device (the server re-checks on the next request).
        if (
          error &&
          typeof navigator !== "undefined" &&
          (!navigator.onLine || error.name === "AuthRetryableFetchError")
        ) {
          const { data: s } = await supabase.auth.getSession();
          return toUser(s.session?.user);
        }
        return null;
      },
      async sendOtp(channel, contact) {
        const { error } =
          channel === "email"
            ? await supabase.auth.signInWithOtp({
                email: contact,
                options: { shouldCreateUser: true },
              })
            : await supabase.auth.signInWithOtp({
                phone: contact,
                options: { shouldCreateUser: true, channel: "sms" },
              });
        return error ? { ok: false, error: authErrorCode(error, channel) } : { ok: true };
      },
      async verifyOtp(channel, contact, code) {
        const { data, error } =
          channel === "email"
            ? await supabase.auth.verifyOtp({ email: contact, token: code, type: "email" })
            : await supabase.auth.verifyOtp({ phone: contact, token: code, type: "sms" });
        const user = toUser(data?.user);
        if (error || !user)
          return { ok: false, error: error ? authErrorCode(error, channel) : "unknown" };
        return { ok: true, user };
      },
      async signOut(opts) {
        await supabase.removeAllChannels();
        // auth-js defaults to { scope: "global" }, which would also end every approved TV.
        await supabase.auth.signOut({ scope: opts?.everywhere ? "global" : "local" });
      },
      onChange(cb) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) =>
          cb(toUser(session?.user)),
        );
        return () => data.subscription.unsubscribe();
      },
    },

    profile: {
      async get() {
        const id = await uid();
        const row = check(
          await supabase.from("profiles").select(PROFILE_COLS).eq("id", id).maybeSingle(),
        );
        if (!row) {
          // The signup trigger creates the row; recreate it if it is missing.
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          const made = check(
            await supabase
              .from("profiles")
              .insert({ id, display_name: "", timezone: tz })
              .select(PROFILE_COLS)
              .single(),
          );
          return toProfile(made as ProfileRow);
        }
        return toProfile(row as ProfileRow);
      },
      async update(patch) {
        const id = await uid();
        // Versioned update (AGENTS.md): send the version we read; on a conflict re-read and re-apply once.
        for (let attempt = 0; attempt < 2; attempt++) {
          const cur = check(
            await supabase.from("profiles").select(PROFILE_COLS).eq("id", id).single(),
          ) as ProfileRow;
          const prefs = { ...prefsOf(cur.preferences) };
          const row: Record<string, unknown> = { version: cur.version };
          if (patch.display_name !== undefined) row["display_name"] = patch.display_name.trim();
          if (patch.timezone !== undefined) row["timezone"] = patch.timezone;
          if (patch.weekly_goal !== undefined) row["weekly_goal"] = patch.weekly_goal;
          if (patch.weight_unit !== undefined) {
            row["weight_unit"] = patch.weight_unit;
            const units = {
              length: "in",
              ...(prefs["units"] as object | undefined),
              weight: patch.weight_unit,
            };
            prefs["units"] = units;
          }
          if (patch.complete_name_step) prefs["v1_name_done"] = true;
          row["preferences"] = prefs;
          const res = await supabase
            .from("profiles")
            .update(row as never)
            .eq("id", id)
            .select(PROFILE_COLS)
            .single();
          if (!res.error) return toProfile(res.data as ProfileRow);
          if (res.error.code !== "40001" || attempt === 1) check(res);
        }
        throw new Error("profile_update_failed");
      },
    },

    zones: {
      async get() {
        const id = await uid();
        return check(
          await supabase.from("zone_configs").select("*").eq("user_id", id).maybeSingle(),
        ) as ZoneConfig | null;
      },
      async confirm([b1, b2, b3, b4]) {
        const id = await uid();
        const now = new Date().toISOString();
        const cur = check(
          await supabase.from("zone_configs").select("*").eq("user_id", id).maybeSingle(),
        ) as ZoneConfig | null;
        if (!cur) {
          return check(
            await supabase
              .from("zone_configs")
              .insert({ user_id: id, b1, b2, b3, b4, confirmed_at: now })
              .select("*")
              .single(),
          ) as ZoneConfig;
        }
        return check(
          await supabase
            .from("zone_configs")
            .update({ b1, b2, b3, b4, confirmed_at: now, version: cur.version })
            .eq("user_id", id)
            .select("*")
            .single(),
        ) as ZoneConfig;
      },
    },

    templates: {
      async list() {
        const rows = check(
          await supabase
            .from("workout_templates")
            .select("*")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false }),
        );
        return (rows ?? []).map(asTemplate);
      },
      async get(id) {
        const row = check(
          await supabase.from("workout_templates").select("*").eq("id", id).maybeSingle(),
        );
        return row ? asTemplate(row) : null;
      },
      async create(body: TemplateBody, id?: string) {
        const res = await supabase
          .from("workout_templates")
          .insert({
            ...(id ? { id } : {}),
            name: body.name.trim(),
            blocks: body.blocks as unknown as Json,
          })
          .select("*")
          .single();
        if (res.error) {
          // A retry after a lost response: the row with this client id is already saved.
          if (id && res.error.code === "23505") {
            const existing = await api.templates.get(id);
            if (existing && !existing.deleted_at) return existing;
          }
          throw parseInvalid(res.error) ?? check(res);
        }
        return asTemplate(res.data);
      },
      async update(id, body, expectedRevision) {
        const res = await supabase
          .from("workout_templates")
          .update({ name: body.name.trim(), blocks: body.blocks as unknown as Json })
          .eq("id", id)
          .eq("revision", expectedRevision)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle();
        if (res.error) throw parseInvalid(res.error) ?? check(res);
        if (!res.data) throw new RevisionConflictError(await api.templates.get(id));
        return asTemplate(res.data);
      },
      async remove(id, expectedRevision) {
        const res = await supabase
          .from("workout_templates")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("revision", expectedRevision)
          .select("id")
          .maybeSingle();
        check(res);
        if (!res.data) throw new RevisionConflictError(await api.templates.get(id));
      },
    },

    sessions: {
      async start(o) {
        const data = check(
          await supabase.rpc("session_start", {
            p_command_id: o.commandId ?? newId(),
            p_template_id: o.templateId,
            p_live_data: o.liveData,
            p_timezone: o.timezone,
            p_client_at: new Date().toISOString(),
            p_is_demo: o.isDemo ?? false,
          }),
        );
        return data as unknown as SessionRpcResult;
      },
      async command(c) {
        const data = check(
          await supabase.rpc("session_command", {
            p_session_id: c.sessionId,
            p_command_id: c.commandId ?? newId(),
            p_expected_revision: c.expectedRevision,
            p_source: c.source,
            p_kind: c.kind,
            p_payload: (c.payload ?? {}) as Json,
            p_client_at: c.clientAt ?? new Date().toISOString(),
          }),
        );
        return data as unknown as SessionRpcResult;
      },
      async current() {
        const id = await uid();
        const row = check(
          await supabase
            .from("workout_sessions")
            .select("*")
            .eq("user_id", id)
            .neq("state", "ended")
            .maybeSingle(),
        );
        return (row as unknown as WorkoutSessionRow) ?? null;
      },
      async recover(id) {
        const row = check(
          await supabase.from("workout_sessions").select("*").eq("id", id).maybeSingle(),
        );
        return (row as unknown as WorkoutSessionRow) ?? null;
      },
      async history(opts) {
        let q = supabase
          .from("session_summaries")
          .select("*, workout_sessions(snapshot, template_id)")
          .order("started_at", { ascending: false })
          .limit(opts?.limit ?? 50);
        if (opts?.before) q = q.lt("started_at", opts.before);
        return withNotes(check(await q) as unknown as SummaryJoin[]);
      },
      async month(year, month) {
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const rows = check(
          await supabase
            .from("session_summaries")
            .select("*, workout_sessions(snapshot, template_id)")
            .gte("local_date", `${year}-${pad(month)}-01`)
            .lte("local_date", `${year}-${pad(month)}-${pad(last)}`)
            .order("started_at", { ascending: true }),
        );
        return withNotes(rows as unknown as SummaryJoin[]);
      },
      async summary(id) {
        const row = check(
          await supabase.from("session_summaries").select("*").eq("session_id", id).maybeSingle(),
        );
        return (row as unknown as SessionSummaryRow) ?? null;
      },
      async finalize(id) {
        // Server function: reads the samples as the caller (RLS) and runs core/zones.ts.
        const { finalizeSessionHr } = await import("./finalize.functions");
        const res = await finalizeSessionHr({ data: { sessionId: id } });
        return (res.summary as SessionSummaryRow | null) ?? null;
      },
    },

    notes: {
      async get(sessionId) {
        const row = check(
          await supabase
            .from("session_notes")
            .select("*")
            .eq("session_id", sessionId)
            .maybeSingle(),
        );
        return (row as SessionNoteRow | null) ?? null;
      },
      async save(sessionId, text, expectedRevision) {
        const data = check(
          await supabase.rpc("session_note_save", {
            p_session_id: sessionId,
            p_text: text,
            p_expected_revision: expectedRevision,
          }),
        );
        return data as unknown as NoteSaveResult;
      },
    },

    devices: {
      async list() {
        const rows = check(
          await supabase
            .from("device_grants")
            .select("*")
            .is("revoked_at", null)
            .order("last_seen_at", { ascending: false }),
        );
        return (rows ?? []) as DeviceGrantRow[];
      },
      async revoke(grantId) {
        const data = check(await supabase.rpc("revoke_device_grant", { p_grant_id: grantId })) as {
          ok?: boolean;
        } | null;
        return !!data?.ok;
      },
    },

    pairing: {
      async preview(code) {
        const res = await supabase.rpc("pairing_preview", { p_code: code });
        if (res.error) return { ok: false, error: "network" as PairingError };
        return res.data as unknown as PairingPreview;
      },
      async approve(code, confirmOtherUser = false) {
        const res = await supabase.rpc("approve_pairing", {
          p_code: code,
          p_confirm_other_user: confirmOtherUser,
        });
        if (res.error) return { ok: false, error: "network" as PairingError };
        return res.data as unknown as PairingResult;
      },
      async deny(code) {
        const res = await supabase.rpc("deny_pairing", { p_code: code });
        if (res.error) return { ok: false, error: "network" as PairingError };
        return res.data as unknown as PairingResult;
      },
    },

    realtime: {
      onSession(userId, cb) {
        const ch: RealtimeChannel = supabase
          .channel(`v1-sessions-${userId}-${newId()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "workout_sessions",
              filter: `user_id=eq.${userId}`,
            },
            (p) => {
              if (p.new && "id" in p.new) cb(p.new as unknown as WorkoutSessionRow);
            },
          )
          .subscribe();
        return () => void supabase.removeChannel(ch);
      },
      onHrLive(userId, cb) {
        const ch: RealtimeChannel = supabase
          .channel(`v1-hr-${userId}-${newId()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "hr_live", filter: `user_id=eq.${userId}` },
            (p) => cb(p.eventType === "DELETE" ? null : (p.new as unknown as HrLiveRow)),
          )
          .subscribe();
        return () => void supabase.removeChannel(ch);
      },
    },

    hr: {
      async live() {
        const id = await uid();
        const row = check(
          await supabase.from("hr_live").select("*").eq("user_id", id).maybeSingle(),
        );
        return (row as unknown as HrLiveRow) ?? null;
      },
      async serverTime() {
        const data = check(await supabase.rpc("server_time"));
        return Date.parse(data as unknown as string);
      },
      async sensor() {
        const id = await uid();
        const row = check(
          await supabase.from("hr_sensors").select("forgotten_at").eq("user_id", id).maybeSingle(),
        );
        return row && !row.forgotten_at ? { paired: true } : null;
      },
      async request(minutes) {
        check(await supabase.rpc("hr_request", { p_minutes: minutes }));
      },
      async samples(sessionId, isDemo) {
        const out: StoredSample[] = [];
        for (let from = 0; from < 100_000; from += 1000) {
          const rows = check(
            await supabase
              .from(isDemo ? "hr_demo_samples" : "hr_samples")
              .select("stream_id, seq, measured_at, bpm, contact, is_demo")
              .eq("session_id", sessionId)
              .order("measured_at", { ascending: true })
              .range(from, from + 999),
          );
          for (const r of rows ?? [])
            out.push({ ...r, measured_at: Date.parse(r.measured_at) } as StoredSample);
          if ((rows?.length ?? 0) < 1000) break;
        }
        return out;
      },
    },

    account: {
      async deleteMyData() {
        const data = check(await supabase.rpc("delete_my_v1_data")) as {
          ok?: boolean;
          error?: string;
          sessions?: number;
          templates?: number;
        } | null;
        if (data?.ok === false) throw new Error(data.error ?? "delete_failed");
        return { sessions: data?.sessions ?? 0, templates: data?.templates ?? 0 };
      },
      async deleteAccount() {
        // Server function: V1 data via the caller's own session, then auth.admin.deleteUser.
        const { deleteMyAccount } = await import("./account.functions");
        await deleteMyAccount();
        await supabase.removeAllChannels();
        await supabase.auth.signOut({ scope: "local" });
      },
    },
  };
  return api;
}
