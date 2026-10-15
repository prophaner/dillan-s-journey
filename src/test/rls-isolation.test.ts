/**
 * Database isolation test (brief §11). Runs against the real backend, so it is skipped
 * until the schema is applied. Run with: RUN_RLS_TESTS=1 bunx vitest run src/test/rls-isolation.test.ts
 * Needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in the environment.
 * Users are created with the admin API and signed in through a magic-link token (no passwords).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = process.env["RUN_RLS_TESTS"] === "1";
const URL = process.env["SUPABASE_URL"] ?? "";
const ANON = process.env["SUPABASE_ANON_KEY"] ?? "";
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function signInAs(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = createClient(URL, ANON, opts);
  const res = await c.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (res.error) throw res.error;
  return { client: c, id: res.data.user!.id };
}

describe.skipIf(!run)("row-level security: set_logs isolation", () => {
  const stamp = Date.now();
  const emails = { a: `rls-a-${stamp}@example.test`, b: `rls-b-${stamp}@example.test`, coach: `rls-c-${stamp}@example.test` };
  let admin: SupabaseClient;
  let A: { client: SupabaseClient; id: string };
  let B: { client: SupabaseClient; id: string };
  let C: { client: SupabaseClient; id: string };
  let setLogId = "";

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, opts);
    for (const email of Object.values(emails)) {
      await admin.auth.admin.createUser({ email, email_confirm: true });
    }
    A = await signInAs(admin, emails.a);
    B = await signInAs(admin, emails.b);
    C = await signInAs(admin, emails.coach);

    const { data: rtv } = await A.client
      .from("routine_template_versions").select("id").eq("owner_id", A.id).limit(1).single();
    const { data: session, error: sErr } = await A.client.from("sessions").insert({
      owner_id: A.id, template_version_id: rtv!.id, plan_snapshot: { demo: true },
      local_date: "2026-10-15", timezone: "UTC", idempotency_key: `s-${stamp}`,
    }).select("id").single();
    if (sErr) throw sErr;
    const { data: log, error } = await A.client.from("set_logs").insert({
      owner_id: A.id, session_id: session!.id, set_no: 1, reps: 8, load: 35, idempotency_key: `l-${stamp}`,
    }).select("id").single();
    if (error) throw error;
    setLogId = log!.id;
  }, 30_000);

  afterAll(async () => {
    for (const u of [A, B, C]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it("user B cannot read user A's set log", async () => {
    const { data } = await B.client.from("set_logs").select("id").eq("id", setLogId);
    expect(data).toEqual([]);
  });

  it("user B cannot update user A's set log", async () => {
    const { data } = await B.client.from("set_logs").update({ reps: 99, version: 1 }).eq("id", setLogId).select("id");
    expect(data ?? []).toEqual([]);
    const { data: check } = await admin.from("set_logs").select("reps").eq("id", setLogId).single();
    expect(check!.reps).toBe(8);
  });

  it("user B cannot delete user A's set log", async () => {
    await B.client.from("set_logs").delete().eq("id", setLogId);
    const { data } = await admin.from("set_logs").select("id").eq("id", setLogId);
    expect(data).toHaveLength(1);
  });

  it("the same idempotency key twice does not create a duplicate", async () => {
    const { data: s } = await admin.from("set_logs").select("session_id").eq("id", setLogId).single();
    const { error } = await A.client.from("set_logs").insert({
      owner_id: A.id, session_id: s!.session_id, set_no: 1, reps: 8, idempotency_key: `l-${stamp}`,
    });
    expect(error?.code).toBe("23505");
  });

  it("a coach cannot grant themselves access", async () => {
    const { error } = await C.client.from("coach_access_grants").insert({
      owner_id: A.id, invite_email: emails.coach, scopes: ["progress"],
    });
    expect(error).not.toBeNull();
  });

  it("a coach with an accepted grant sees progress; after revoke, nothing", async () => {
    const { data: g, error } = await A.client.from("coach_access_grants")
      .insert({ owner_id: A.id, invite_email: emails.coach, scopes: ["progress"] })
      .select("id, version").single();
    if (error) throw error;
    const acc = await C.client.rpc("accept_grant", { _grant_id: g!.id });
    expect(acc.error).toBeNull();

    const before = await C.client.from("set_logs").select("id").eq("id", setLogId);
    expect(before.data).toHaveLength(1);

    const { data: cur } = await A.client.from("coach_access_grants").select("version").eq("id", g!.id).single();
    await A.client.from("coach_access_grants").update({ status: "revoked", version: cur!.version }).eq("id", g!.id);

    const after = await C.client.from("set_logs").select("id").eq("id", setLogId);
    expect(after.data).toEqual([]);
    const sessions = await C.client.from("sessions").select("id").eq("owner_id", A.id);
    expect(sessions.data).toEqual([]);
    const profiles = await C.client.rpc("coach_trainee_profiles");
    expect(profiles.data ?? []).toEqual([]);
  });
});
