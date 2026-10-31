// @vitest-environment node
// Boots PGlite with a minimal Supabase-like `auth` stub, applies drizzle/migrations 0000-0006
// and checks RLS, the session RPCs, engine/validation parity, hr_ingest and TV pairing.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCommand } from "@/v1/core/engine";
import { buildSteps } from "@/v1/core/steps";
import type { ApplyResult, EngineState } from "@/v1/core/types";
import { BLOCKS, CASES, runCase } from "./fixtures/engine-harness";
import { TEMPLATE_CASES, straight, superset } from "./fixtures/template-cases";

const MIGRATIONS = path.resolve(__dirname, "../../../drizzle/migrations");

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: everything new in public is granted to the API roles
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create publication supabase_realtime;
`;

let db: PGlite;
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const TZ = "America/New_York";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Who = string | "anon" | "service";
async function as<T>(who: Who, fn: () => Promise<T>, sessionId?: string): Promise<T> {
  const uid = who === "anon" || who === "service" ? "" : who;
  const role = who === "anon" ? "anon" : who === "service" ? "service_role" : "authenticated";
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid || undefined, role, session_id: sessionId })],
  );
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function rpc(name: string, args: Record<string, unknown> = {}): Promise<Json> {
  const keys = Object.keys(args);
  const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  const vals = keys.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
  });
  return (await db.query<{ r: Json }>(sql, vals)).rows[0]?.r;
}

const asRpc = (who: Who, name: string, args: Record<string, unknown> = {}, sid?: string) =>
  as(who, () => rpc(name, args), sid);

async function newTemplate(
  who: string,
  blocks: unknown = [straight()],
  name = "Upper A",
): Promise<string> {
  const r = await as(who, () =>
    q<{ id: string }>(
      "insert into public.workout_templates (user_id, name, blocks) values ($1, $2, $3) returning id",
      [who, name, JSON.stringify(blocks)],
    ),
  );
  return r[0]!.id;
}

const start = (who: string, templateId: string, o: Record<string, unknown> = {}) =>
  asRpc(who, "session_start", {
    p_command_id: randomUUID(),
    p_template_id: templateId,
    p_live_data: true,
    p_timezone: TZ,
    ...o,
  });

const cmd = (who: string, session: Json, kind: string, o: Record<string, unknown> = {}) =>
  asRpc(who, "session_command", {
    p_session_id: session.id,
    p_command_id: randomUUID(),
    p_expected_revision: session.revision,
    p_source: "phone",
    p_kind: kind,
    p_payload: {},
    ...o,
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  expect(files.at(-1)).toBe("0006_v1_core.sql");
  for (const f of files) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await db.query(
    "insert into auth.users (id, email) values ($1, 'ana@example.com'), ($2, 'bea@example.com'), ($3, 'cy@example.com')",
    [A, B, C],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("migration 0006 shape", () => {
  it("adds weekly_goal to profiles with default 3 and bounds 1-14", async () => {
    const r = await as(A, () =>
      q<{ weekly_goal: number }>("select weekly_goal from public.profiles where id = $1", [A]),
    );
    expect(r[0]?.weekly_goal).toBe(3);
    await expect(
      as(A, () =>
        q("update public.profiles set weekly_goal = 15, version = version where id = $1", [A]),
      ),
    ).rejects.toThrow(/check/);
  });

  it("enables RLS on every V1 table and publishes sessions and hr_live", async () => {
    const t = await q<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
        and relname in ('workout_templates','zone_configs','workout_sessions','session_commands','session_notes',
        'session_summaries','hr_sources','hr_sensors','hr_live','hr_samples','hr_demo_samples','pairing_challenges',
        'pairing_approve_failures','device_grants')`,
    );
    expect(t).toHaveLength(14);
    expect(t.every((x) => x.relrowsecurity)).toBe(true);
    const pub = await q<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
    );
    expect(pub.map((p) => p.tablename)).toEqual(["hr_live", "hr_sensors", "workout_sessions"]);
  });
});

describe("engine parity: SQL v1_engine_apply == TS applyCommand on the shared fixtures", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const blocks = BLOCKS[c.blocks]!;
      const sqlSteps = (
        await q<{ s: Json }>("select public.v1_build_steps($1::jsonb) as s", [
          JSON.stringify(blocks),
        ])
      )[0]!.s;
      expect(sqlSteps).toEqual(buildSteps(blocks));
      const sqlApply = async (
        s: EngineState,
        ec: { kind: string; payload?: unknown; expected_revision: number },
        at: number,
      ) =>
        (
          await q<{ r: ApplyResult }>(
            "select public.v1_engine_apply($1::jsonb, $2, $3::jsonb, $4, $5::bigint) as r",
            [
              JSON.stringify(s),
              ec.kind,
              JSON.stringify(ec.payload ?? {}),
              ec.expected_revision,
              at,
            ],
          )
        )[0]!.r;
      const sqlTrace = await runCase(c, sqlSteps, sqlApply);
      const tsTrace = await runCase(c, buildSteps(blocks), (s, ec, at) => applyCommand(s, ec, at));
      expect(sqlTrace).toEqual(tsTrace);
    });
  }
});

describe("template validation parity: v1_template_errors == validate.ts", () => {
  for (const c of TEMPLATE_CASES) {
    it(c.name, async () => {
      const r = (
        await q<{ e: Array<{ path: string; code: string }> }>(
          "select public.v1_template_errors($1, $2::jsonb) as e",
          [c.tname, JSON.stringify(c.blocks)],
        )
      )[0]!.e;
      expect(r.map((e) => [e.path, e.code])).toEqual(c.errors);
    });
  }
});

describe("templates", () => {
  it("validates on insert, bumps revision with an optimistic check, cannot be hard-deleted", async () => {
    await expect(newTemplate(A, [straight({ sets: 21 })])).rejects.toThrow(/invalid_template/);
    const id = await newTemplate(A, [straight(), superset()]);
    const rev = await as(A, () =>
      q<{ revision: number }>(
        "update public.workout_templates set name = 'Upper B', revision = 1 where id = $1 returning revision",
        [id],
      ),
    );
    expect(rev[0]?.revision).toBe(2);
    await expect(
      as(A, () =>
        q("update public.workout_templates set name = 'X', revision = 1 where id = $1", [id]),
      ),
    ).rejects.toThrow(/revision conflict/);
    await expect(
      as(A, () => q("delete from public.workout_templates where id = $1", [id])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("tenant isolation (RLS)", () => {
  it("user B cannot read or mutate user A's rows", async () => {
    const tid = await newTemplate(A);
    const s = (await start(A, tid)).session;
    const started = (await cmd(A, s, "start")).session;
    await cmd(A, started, "end");
    await asRpc(A, "session_note_save", {
      p_session_id: s.id,
      p_text: "Felt strong",
      p_expected_revision: 0,
    });

    for (const t of [
      "workout_templates",
      "workout_sessions",
      "session_commands",
      "session_notes",
      "session_summaries",
    ]) {
      const own = await as(A, () => q<{ n: number }>(`select count(*)::int as n from public.${t}`));
      const other = await as(B, () =>
        q<{ n: number }>(`select count(*)::int as n from public.${t}`),
      );
      expect(own[0]!.n, t).toBeGreaterThan(0);
      expect(other[0]!.n, t).toBe(0);
    }
    const upd = await as(B, () =>
      q(
        "update public.workout_templates set deleted_at = now(), revision = revision where id = $1 returning id",
        [tid],
      ),
    );
    expect(upd).toHaveLength(0);
    await expect(
      as(B, () =>
        q("insert into public.workout_templates (user_id, name, blocks) values ($1, 'x', $2)", [
          A,
          JSON.stringify([straight()]),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(B, () => q("update public.workout_sessions set state = 'ended' where id = $1", [s.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(A, () =>
        q(
          "insert into public.hr_live (user_id, holder_source_id, holder_stream_id, holder_name, source_kind, relay_mode) values ($1, $2, $2, 'x', 'demo', 'idle')",
          [A, randomUUID()],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    expect((await cmd(B, s, "pause")).error).toBe("not_found");
    expect(
      (
        await asRpc(B, "session_note_save", {
          p_session_id: s.id,
          p_text: "hijack",
          p_expected_revision: 1,
        })
      ).error,
    ).toBe("not_found");
    expect((await start(B, tid)).error).toBe("template_not_found");
    await expect(as("anon", () => q("select * from public.workout_templates"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRpc("anon", "session_start", {
        p_command_id: randomUUID(),
        p_template_id: tid,
        p_live_data: false,
        p_timezone: TZ,
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("session RPCs", () => {
  it("duplicate start and duplicate end produce one session and one history row", async () => {
    const tid = await newTemplate(C, [straight({ sets: 1 })]);
    const commandId = randomUUID();
    const args = {
      p_command_id: commandId,
      p_template_id: tid,
      p_live_data: false,
      p_timezone: TZ,
    };
    const r1 = await asRpc(C, "session_start", args);
    const r2 = await asRpc(C, "session_start", args);
    expect(r1.ok).toBe(true);
    expect(r2).toEqual(r1);
    const other = await start(C, tid);
    expect(other).toMatchObject({ ok: false, error: "session_running", session_id: r1.session.id });
    expect(r1.session).toMatchObject({
      state: "preparing",
      revision: 1,
      start_timezone: TZ,
      live_data: false,
      cursor: 0,
    });
    expect(r1.session.steps).toHaveLength(1);

    const s = (await cmd(C, r1.session, "start")).session;
    const endId = randomUUID();
    const endArgs = {
      p_session_id: s.id,
      p_command_id: endId,
      p_expected_revision: s.revision,
      p_source: "tv",
      p_kind: "end",
      p_payload: {},
    };
    const e1 = await asRpc(C, "session_command", endArgs);
    const e2 = await asRpc(C, "session_command", endArgs);
    expect(e1.ok).toBe(true);
    expect(e2).toEqual(e1);
    expect(e1.session).toMatchObject({ state: "ended", outcome: "partial", last_source: "tv" });
    const e3 = await cmd(C, e1.session, "end");
    expect(e3).toMatchObject({ ok: false, error: "session_ended" });
    const counts = await as(C, () =>
      q<{ s: number; h: number }>(
        "select (select count(*)::int from public.workout_sessions) as s, (select count(*)::int from public.session_summaries) as h",
      ),
    );
    expect(counts[0]).toEqual({ s: 1, h: 1 });
    const sum = (await as(C, () => q<Json>("select * from public.session_summaries")))[0];
    expect(sum).toMatchObject({
      outcome: "partial",
      hr_status: "no_live_data",
      start_timezone: TZ,
    });
    expect(Number(sum.unmeasured_ms)).toBe(Number(sum.active_ms));
  });

  it("stale revision, completion, ended terminal and snapshot immutability", async () => {
    const tid = await newTemplate(B, [straight({ sets: 2, rest_s: 60 })], "Legs");
    const s0 = (await start(B, tid)).session;
    const s1 = (await cmd(B, s0, "start")).session;
    expect(s1).toMatchObject({ state: "active", revision: 2 });
    const stale = await cmd(B, s0, "complete_set", { p_payload: { step: 0 } });
    expect(stale).toMatchObject({ ok: false, error: "stale_revision" });
    expect(stale.session.revision).toBe(2);
    const paused = await cmd(B, s0, "pause"); // stale but valid: applied
    expect(paused.session).toMatchObject({ state: "paused", revision: 3 });
    const resumed = (await cmd(B, paused.session, "resume")).session;
    const done = (await cmd(B, resumed, "complete_set", { p_payload: { step: 0, reps: 9 } }))
      .session;
    expect(done.results["0.0.0"]).toMatchObject({ status: "done", reps: 9, weight: 40 });
    expect(done.rest_ends_at).not.toBeNull();

    // editing the template never changes the session snapshot (acceptance 15)
    await as(B, () =>
      q(
        "update public.workout_templates set name = 'Legs v2', blocks = $2, revision = 1 where id = $1",
        [tid, JSON.stringify([straight({ sets: 5 })])],
      ),
    );
    await as(B, () =>
      q("update public.workout_templates set deleted_at = now(), revision = 2 where id = $1", [
        tid,
      ]),
    );
    const fin = (await cmd(B, done, "complete_set", { p_payload: { step: 1 } })).session;
    const ended = (await cmd(B, fin, "end")).session;
    expect(ended).toMatchObject({ state: "ended", outcome: "completed" });
    expect(ended.snapshot.name).toBe("Legs");
    expect(ended.snapshot.blocks[0].sets).toBe(2);
    expect((await start(B, tid)).error).toBe("template_not_found"); // soft-deleted: hidden from selection

    await expect(
      q(
        "update public.workout_sessions set state = 'active', outcome = null, ended_at = null where id = $1",
        [ended.id],
      ),
    ).rejects.toThrow(/terminal/);
    await expect(
      q("update public.workout_sessions set snapshot = '{}' where id = $1", [ended.id]),
    ).rejects.toThrow(/immutable/);
  });

  it("allows only one unfinished session per user at the database level", async () => {
    const tid = await newTemplate(A, [straight()]);
    const r = await start(A, tid);
    expect(r.ok).toBe(true);
    await expect(
      q(
        "insert into public.workout_sessions (user_id, snapshot, steps, start_timezone, live_data) values ($1, '{}', '[]', 'UTC', false)",
        [A],
      ),
    ).rejects.toThrow(/workout_sessions_one_unfinished/);
    const d = await cmd(A, r.session, "discard");
    expect(d.session).toMatchObject({ state: "ended", outcome: "discarded" });
    const sums = await as(A, () =>
      q<{ n: number }>(
        "select count(*)::int as n from public.session_summaries where session_id = $1",
        [r.session.id],
      ),
    );
    expect(sums[0]!.n).toBe(0);
  });

  it("rejects bad input", async () => {
    const tid = await newTemplate(A, [straight()]);
    expect((await start(A, tid, { p_timezone: "Mars/Olympus" })).error).toBe("invalid_timezone");
    await expect(
      asRpc(A, "session_command", {
        p_session_id: randomUUID(),
        p_command_id: randomUUID(),
        p_expected_revision: 1,
        p_source: "watch",
        p_kind: "pause",
      }),
    ).rejects.toThrow(/invalid source/);
  });

  it("notes save with revision checks", async () => {
    const tid = await newTemplate(B, [straight()]);
    const s = (await start(B, tid)).session;
    const n1 = await asRpc(B, "session_note_save", {
      p_session_id: s.id,
      p_text: "one",
      p_expected_revision: 0,
    });
    expect(n1).toMatchObject({ ok: true, note: { text: "one", revision: 1 } });
    const n2 = await asRpc(B, "session_note_save", {
      p_session_id: s.id,
      p_text: "two",
      p_expected_revision: 0,
    });
    expect(n2).toMatchObject({
      ok: false,
      error: "stale_revision",
      note: { text: "one", revision: 1 },
    });
    const n3 = await asRpc(B, "session_note_save", {
      p_session_id: s.id,
      p_text: "two",
      p_expected_revision: 1,
    });
    expect(n3).toMatchObject({ ok: true, note: { text: "two", revision: 2 } });
    await cmd(B, s, "discard");
  });

  it("finalizes zones only when the invariant holds", async () => {
    const tid = await newTemplate(B, [straight({ sets: 1 })]);
    let s = (await start(B, tid)).session;
    s = (await cmd(B, s, "start")).session;
    s = (await cmd(B, s, "end")).session;
    const sum = (
      await as(B, () =>
        q<Json>("select * from public.session_summaries where session_id = $1", [s.id]),
      )
    )[0];
    expect(sum.hr_status).toBe("pending");
    const active = Number(sum.active_ms);
    const bad = await asRpc(B, "session_hr_finalize", {
      p_session_id: s.id,
      p_zone_ms: `{0,0,0,0,0}`,
      p_unmeasured_ms: active + 5000,
      p_algorithm_version: 1,
    });
    expect(bad.error).toBe("invariant");
    const ok = await asRpc(B, "session_hr_finalize", {
      p_session_id: s.id,
      p_zone_ms: `{0,0,0,0,0}`,
      p_unmeasured_ms: active,
      p_algorithm_version: 1,
    });
    expect(ok).toMatchObject({ ok: true, summary: { hr_status: "final", coverage: 0 } });
    expect(
      (
        await asRpc(A, "session_hr_finalize", {
          p_session_id: s.id,
          p_zone_ms: `{0,0,0,0,0}`,
          p_unmeasured_ms: active,
          p_algorithm_version: 1,
        })
      ).error,
    ).toBe("not_found");
  });
});

describe("hr_ingest", () => {
  const sample = (
    seq: number,
    agoMs = 1000,
    bpm: number | null = 120,
    contact: boolean | null = true,
  ) => ({
    seq,
    measured_at: new Date(Date.now() - agoMs).toISOString(),
    bpm,
    contact,
    rr_ms: null,
  });
  const ingest = (who: string, o: Record<string, unknown>) =>
    asRpc(who, "hr_ingest", {
      p_source_id: o["source"],
      p_stream_id: o["stream"],
      p_expected_user_id: o["expected"] ?? who,
      p_source_kind: o["kind"] ?? "web_ble",
      p_mode: o["mode"] ?? "live",
      p_connected_at: new Date(Date.now() - 5000).toISOString(),
      p_sensor:
        o["sensor"] === undefined
          ? { name: "Polar H10 1A2B3C4D", serial: "1A2B3C4D", battery_pct: 80 }
          : o["sensor"],
      p_claim: o["claim"] ?? false,
      p_samples: o["samples"] ?? [],
      p_source_name: "Gym tablet",
    });

  // samples measured shortly before "now" must fall inside the session
  const backdate = (id: string) =>
    q(
      "update public.workout_sessions set started_at = now() - interval '5 minutes' where id = $1",
      [id],
    );

  it("dedupes, checks ownership, separates demo, rejects out-of-window samples", async () => {
    const tid = await newTemplate(C, [straight()]);
    let s = (await start(C, tid)).session;
    s = (await cmd(C, s, "start")).session;
    await backdate(s.id);
    const src = randomUUID();
    const stream = randomUUID();

    const r1 = await ingest(C, {
      source: src,
      stream,
      claim: true,
      samples: [sample(1, 2000), sample(2, 1000)],
    });
    expect(r1).toMatchObject({
      accepted: 2,
      duplicates: 0,
      superseded: false,
      stop_requested: false,
      identity_mismatch: false,
      holder_name: "Gym tablet",
    });
    const r2 = await ingest(C, {
      source: src,
      stream,
      samples: [sample(1, 2000), sample(2, 1000), sample(3, 500, null, false)],
    });
    expect(r2).toMatchObject({ accepted: 1, duplicates: 2 });
    const live = (await as(C, () => q<Json>("select * from public.hr_live")))[0];
    expect(live).toMatchObject({
      holder_source_id: src,
      bpm: null,
      contact: false,
      active_session_id: s.id,
      is_demo: false,
    });

    const r3 = await ingest(C, {
      source: src,
      stream,
      samples: [sample(4, 200_000), sample(5, -60_000), sample(6, 100, 300)],
    });
    expect(r3.rejected).toEqual([
      { seq: 4, reason: "too_old" },
      { seq: 5, reason: "future" },
    ]);
    expect(r3.accepted).toBe(1); // bpm 300 is stored as null evidence
    const stored = await as(C, () =>
      q<{ seq: number; bpm: number | null }>("select seq, bpm from public.hr_samples order by seq"),
    );
    expect(stored).toEqual([
      { seq: 1, bpm: 120 },
      { seq: 2, bpm: 120 },
      { seq: 3, bpm: null },
      { seq: 6, bpm: null },
    ]);

    // identity mismatch writes nothing
    expect(
      (await ingest(C, { source: src, stream, expected: A, samples: [sample(9)] }))
        .identity_mismatch,
    ).toBe(true);
    // another user's source id is refused
    await expect(
      ingest(A, { source: src, stream: randomUUID(), samples: [sample(1)] }),
    ).rejects.toThrow(/another user/);
    // a second relay while the holder is fresh is superseded without a claim
    const other = await ingest(C, {
      source: randomUUID(),
      stream: randomUUID(),
      samples: [sample(10)],
    });
    expect(other).toMatchObject({ superseded: true, holder_name: "Gym tablet", accepted: 0 });
    // a demo source never takes over a fresh real holder and its samples never land in a real session
    const demo = await ingest(C, {
      source: randomUUID(),
      stream: randomUUID(),
      kind: "demo",
      mode: "demo",
      claim: true,
      samples: [sample(1)],
    });
    expect(demo.superseded).toBe(true);
    // B sees none of C's heart-rate rows
    for (const t of ["hr_samples", "hr_live", "hr_sources", "hr_sensors"]) {
      const n = await as(B, () => q<{ n: number }>(`select count(*)::int as n from public.${t}`));
      expect(n[0]!.n, t).toBe(0);
    }
    // after End, HR is not wanted: nothing is stored and hr_live bpm is cleared
    expect((await cmd(C, s, "end")).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1100)); // stay under the 3 calls/s/source limit
    const after = await ingest(C, { source: src, stream, samples: [sample(20)] });
    expect(after).toMatchObject({ stop_requested: true, accepted: 0 });
    expect((await as(C, () => q<Json>("select bpm from public.hr_live")))[0].bpm).toBeNull();
  });

  it("stores demo samples separately and only for demo sessions", async () => {
    const tid = await newTemplate(B, [straight()]);
    let s = (await start(B, tid, { p_is_demo: true })).session;
    s = (await cmd(B, s, "start")).session;
    await backdate(s.id);
    const src = randomUUID();
    const stream = randomUUID();
    const r = await ingest(B, {
      source: src,
      stream,
      kind: "demo",
      mode: "demo",
      claim: true,
      samples: [sample(1), sample(2)],
    });
    expect(r.accepted).toBe(2);
    const counts = await as(B, () =>
      q<{ real: number; demo: number }>(
        "select (select count(*)::int from public.hr_samples) as real, (select count(*)::int from public.hr_demo_samples) as demo",
      ),
    );
    expect(counts[0]).toEqual({ real: 0, demo: 2 });
    // a real relay sample during a demo session: real source takes over the demo holder but the sample has no session
    const real = await ingest(B, {
      source: randomUUID(),
      stream: randomUUID(),
      samples: [sample(1)],
    });
    expect(real.rejected).toEqual([{ seq: 1, reason: "demo_mismatch" }]);
    await cmd(B, s, "discard");
  });

  it("rate-limits more than 3 calls per second per source", async () => {
    const src = randomUUID();
    const stream = randomUUID();
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(await ingest(A, { source: src, stream, mode: "idle", sensor: null }));
    expect(results.some((r) => r.rate_limited)).toBe(true);
  });
});

describe("TV pairing", () => {
  const create = async (forUser: string | null = null) => {
    const secret = randomUUID() + randomUUID();
    const r = await asRpc("service", "pairing_create", {
      p_device_id: `tv-${randomUUID()}`,
      p_secret_hash: sha(secret),
      p_device_label: "Living Room Fire TV",
      p_for_user_id: forUser,
    });
    expect(r.ok).toBe(true);
    expect(r.code).toMatch(/^DLN-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    return { ...r, secret };
  };

  it("approve -> consume once -> grant -> revoke deletes the TV auth session", async () => {
    const p = await create();
    expect(
      await asRpc(A, "pairing_preview", { p_code: p.code.toLowerCase().replace("-", " ") }),
    ).toMatchObject({ ok: true, device_label: "Living Room Fire TV", for_other_user: false });
    expect(await asRpc(A, "approve_pairing", { p_code: p.code })).toMatchObject({ ok: true });
    expect(
      await asRpc("service", "pairing_status", { p_id: p.id, p_secret: p.secret }),
    ).toMatchObject({ ok: true, status: "approved" });
    const c1 = await asRpc("service", "pairing_consume", { p_id: p.id, p_secret: p.secret });
    expect(c1).toMatchObject({ ok: true, user_id: A });
    expect(
      await asRpc("service", "pairing_consume", { p_id: p.id, p_secret: p.secret }),
    ).toMatchObject({ ok: false, error: "already_used" });
    expect(await asRpc(A, "approve_pairing", { p_code: p.code })).toMatchObject({
      ok: false,
      error: "already_resolved",
    });

    const tvSession = randomUUID();
    await q("insert into auth.sessions (id, user_id) values ($1, $2)", [tvSession, A]);
    const g = await asRpc(
      A,
      "device_grant_register",
      { p_device_id: c1.device_id, p_label: "Living room" },
      tvSession,
    );
    expect(g).toMatchObject({
      ok: true,
      grant: { user_id: A, session_id: tvSession, label: "Living room" },
    });
    expect(
      await asRpc(A, "device_grant_register", { p_device_id: c1.device_id }, tvSession),
    ).toMatchObject({ ok: false, error: "no_pairing" });
    expect(
      await asRpc(A, "device_grant_touch", { p_device_id: c1.device_id }, tvSession),
    ).toMatchObject({ valid: true });
    expect(await asRpc(B, "revoke_device_grant", { p_grant_id: g.grant.id })).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(await asRpc(A, "revoke_device_grant", { p_grant_id: g.grant.id })).toMatchObject({
      ok: true,
    });
    expect(await q("select * from auth.sessions where id = $1", [tvSession])).toHaveLength(0);
    expect(
      await asRpc(A, "device_grant_touch", { p_device_id: c1.device_id }, tvSession),
    ).toMatchObject({ valid: false });
  });

  it("deny, expire, cancel, for-other-user, wrong secret and guess limits", async () => {
    const d = await create();
    expect(await asRpc(B, "deny_pairing", { p_code: d.code })).toMatchObject({ ok: true });
    expect(
      await asRpc("service", "pairing_status", { p_id: d.id, p_secret: d.secret }),
    ).toMatchObject({ status: "denied" });
    expect(
      await asRpc("service", "pairing_consume", { p_id: d.id, p_secret: d.secret }),
    ).toMatchObject({ ok: false, error: "not_approved" });

    const e = await create();
    await q(
      "update public.pairing_challenges set expires_at = now() - interval '1 second' where id = $1",
      [e.id],
    );
    expect(await asRpc(B, "approve_pairing", { p_code: e.code })).toMatchObject({
      ok: false,
      error: "expired",
    });
    expect(
      await asRpc("service", "pairing_status", { p_id: e.id, p_secret: e.secret }),
    ).toMatchObject({ status: "expired" });

    const f = await create(B);
    expect(await asRpc(A, "approve_pairing", { p_code: f.code })).toMatchObject({
      ok: false,
      error: "for_other_user",
      for_name: "bea",
    });
    expect(
      await asRpc(A, "approve_pairing", { p_code: f.code, p_confirm_other_user: true }),
    ).toMatchObject({ ok: true });

    const w = await create();
    for (let i = 0; i < 4; i++)
      expect(
        (await asRpc("service", "pairing_status", { p_id: w.id, p_secret: "nope" })).error,
      ).toBe("bad_secret");
    await asRpc("service", "pairing_status", { p_id: w.id, p_secret: "nope" });
    expect(
      await asRpc("service", "pairing_status", { p_id: w.id, p_secret: w.secret }),
    ).toMatchObject({ status: "cancelled" });

    // a new challenge for the same device cancels the old one
    const x = await create();
    await asRpc("service", "pairing_cancel", { p_id: x.id, p_secret: x.secret });
    expect(await asRpc(C, "approve_pairing", { p_code: x.code })).toMatchObject({ ok: false });

    // guessing: 10 failures per user per 10 minutes, then rate_limited even for a valid code
    const real = await create();
    const failures = await as(C, async () => {
      const out: string[] = [];
      for (let i = 0; i < 12; i++)
        out.push((await rpc("approve_pairing", { p_code: "DLN-ZZZZ" })).error);
      return out;
    });
    expect(
      failures.filter((x) => x === "invalid_code" || x === "already_resolved" || x === "expired")
        .length,
    ).toBeLessThanOrEqual(10);
    expect(failures.at(-1)).toBe("rate_limited");
    expect(await asRpc(C, "approve_pairing", { p_code: real.code })).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
  });

  it("is invisible to clients except through the RPCs", async () => {
    await expect(as(A, () => q("select * from public.pairing_challenges"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRpc(A, "pairing_create", { p_device_id: "tv-123456789", p_secret_hash: sha("x") }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRpc(A, "pairing_consume", { p_id: randomUUID(), p_secret: "x" }),
    ).rejects.toThrow(/permission denied/);
    await expect(asRpc("anon", "approve_pairing", { p_code: "DLN-AAAA" })).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("delete_my_v1_data", () => {
  it("removes every V1 row of the caller and nothing of anyone else", async () => {
    const before = await as(B, () =>
      q<{ n: number }>("select count(*)::int as n from public.workout_sessions"),
    );
    expect(before[0]!.n).toBeGreaterThan(0);
    const r = await asRpc(A, "delete_my_v1_data");
    expect(r.ok).toBe(true);
    const left = await q<{ n: number }>(
      `select (select count(*) from public.workout_templates where user_id = $1)
            + (select count(*) from public.workout_sessions where user_id = $1)
            + (select count(*) from public.session_commands where user_id = $1)
            + (select count(*) from public.hr_sources where user_id = $1)
            + (select count(*) from public.hr_live where user_id = $1)
            + (select count(*) from public.device_grants where user_id = $1) as n`,
      [A],
    );
    expect(Number(left[0]!.n)).toBe(0);
    const after = await as(B, () =>
      q<{ n: number }>("select count(*)::int as n from public.workout_sessions"),
    );
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});
