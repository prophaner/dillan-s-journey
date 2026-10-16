import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { PlanSnapshot } from "./workout";

type SB = SupabaseClient<Database>;
const idem = { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true } as const;
const fail = (e: { message: string; code?: string } | null, what: string) => {
  if (e) throw new Error(`retry: ${what}: ${e.message}`);
};
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const numOrNull = (v: unknown, max: number) =>
  v === null || v === undefined ? null : typeof v === "number" && v >= 0 && v <= max ? v : (() => { throw new Error("400 bad number"); })();

export async function storeSessionStart(sb: SB, userId: string, key: string, raw: unknown) {
  const p = raw as { id: string; snapshot: PlanSnapshot; localDate: string; timezone: string; startedAt: string };
  if (!uuid(p?.id) || !uuid(p.snapshot?.templateVersionId) || !/^\d{4}-\d{2}-\d{2}$/.test(p.localDate)) {
    throw new Error("400 bad session");
  }
  // The plan version must be the caller's own (RLS hides anyone else's).
  const { data: v, error: vErr } = await sb
    .from("routine_template_versions").select("id, is_demo").eq("id", p.snapshot.templateVersionId).maybeSingle();
  fail(vErr, "plan read");
  if (!v) throw new Error("400 plan not found");
  const { error } = await sb.from("sessions").upsert({
    id: p.id, owner_id: userId, template_version_id: v.id, plan_snapshot: p.snapshot as unknown as Json,
    started_at: p.startedAt, local_date: p.localDate, timezone: String(p.timezone).slice(0, 64),
    idempotency_key: key, source: "user", is_demo: v.is_demo,
  }, idem);
  fail(error, "session insert");
}

export async function storeSetLog(sb: SB, userId: string, key: string, raw: unknown) {
  const p = raw as { sessionId?: unknown; exerciseId?: unknown; ref?: unknown; setNo?: unknown; unit?: unknown; reps?: unknown; load?: unknown; rir?: unknown; loggedAt?: unknown; isDemo?: unknown };
  if (!uuid(p?.sessionId) || !uuid(p.exerciseId) || typeof p.ref !== "string") throw new Error("400 bad set");
  const setNo = Number(p.setNo);
  if (!Number.isInteger(setNo) || setNo < 1 || setNo > 50) throw new Error("400 bad set number");
  const unit = p.unit === "kg" ? "kg" : "lb";
  // A swapped exercise must be one this user can see (shared library or their own).
  const { data: ex, error: exErr } = await sb.from("exercises").select("id").eq("id", p.exerciseId as string).maybeSingle();
  fail(exErr, "exercise read");
  if (!ex) throw new Error("400 exercise not found");
  const { error } = await sb.from("set_logs").upsert({
    owner_id: userId, session_id: p.sessionId as string, exercise_id: p.exerciseId as string,
    prescription_ref: (p.ref as string).slice(0, 20), set_no: setNo,
    reps: numOrNull(p.reps, 1000), load: numOrNull(p.load, 2000), load_unit: unit, rir: numOrNull(p.rir, 10),
    logged_at: typeof p.loggedAt === "string" ? p.loggedAt : new Date().toISOString(),
    idempotency_key: key, source: "user", is_demo: p.isDemo === true,
  }, idem);
  if (error && /set_logs_session_id_fkey|row-level security/i.test(error.message)) {
    throw new Error("retry: session not stored yet");
  }
  fail(error, "set insert");
}

/** Undo: removes the set stored under the original write's key. Repeating it is harmless. */
export async function deleteSetLog(sb: SB, userId: string, raw: unknown) {
  const k = (raw as { setKey?: unknown })?.setKey;
  if (typeof k !== "string" || k.length < 8) throw new Error("400 bad undo");
  const { error } = await sb.from("set_logs").delete().eq("owner_id", userId).eq("idempotency_key", k);
  fail(error, "set delete");
}

export async function storeSessionFinish(sb: SB, userId: string, key: string, version: number, raw: unknown) {
  const p = raw as { id: string; completion: string; endedAt: string; feeling: string | null; note: string };
  if (!uuid(p?.id) || !["complete", "partial", "stopped"].includes(p.completion)) throw new Error("400 bad finish");
  const feedback = {
    feeling: ["easy", "solid", "hard", "too_much"].includes(p.feeling ?? "") ? p.feeling : null,
    note: typeof p.note === "string" ? p.note.slice(0, 1000) : "",
    finish_key: key,
  };
  const { data: cur, error: rErr } = await sb.from("sessions").select("version, feedback").eq("id", p.id).maybeSingle();
  fail(rErr, "session read");
  if (!cur) throw new Error("retry: session not stored yet");
  if ((cur.feedback as { finish_key?: string } | null)?.finish_key === key) return; // replay of a stored finish
  const { data, error } = await sb.from("sessions").update({
    completion: p.completion, ended_at: p.endedAt, feedback, version,
  }).eq("id", p.id).eq("owner_id", userId).select("id");
  if (error) {
    if (error.code === "40001" || /version conflict/i.test(error.message)) throw new Error("409 conflict: session changed elsewhere");
    fail(error, "session update");
  }
  if (!data?.length) throw new Error("retry: session not updated");
}

/** Correction of a logged set (reps, load, effort). Sends the version it read; a replay of a stored edit is a no-op. */
export async function storeSetEdit(sb: SB, userId: string, version: number, raw: unknown) {
  const p = raw as { setKey?: unknown; reps?: unknown; load?: unknown; rir?: unknown };
  if (typeof p?.setKey !== "string" || p.setKey.length < 8) throw new Error("400 bad edit");
  const patch = { reps: numOrNull(p.reps, 1000), load: numOrNull(p.load, 2000), rir: numOrNull(p.rir, 10) };
  const { data, error } = await sb.from("set_logs").update({ ...patch, version })
    .eq("owner_id", userId).eq("idempotency_key", p.setKey).select("id");
  if (error) {
    if (error.code === "40001" || /version conflict/i.test(error.message)) {
      const { data: cur } = await sb.from("set_logs").select("reps, load, rir")
        .eq("owner_id", userId).eq("idempotency_key", p.setKey).maybeSingle();
      const same = cur && cur.reps === patch.reps && Number(cur.load ?? -1) === Number(patch.load ?? -1) && Number(cur.rir ?? -1) === Number(patch.rir ?? -1);
      if (same) return; // this edit was already stored
      throw new Error("409 conflict: set changed elsewhere");
    }
    fail(error, "set edit");
  }
  if (!data?.length) throw new Error("retry: set not stored yet");
}

/** Discard: removes the session; its sets go with it (on delete cascade). Repeating it is harmless. */
export async function discardSession(sb: SB, userId: string, raw: unknown) {
  const id = (raw as { sessionId?: unknown })?.sessionId;
  if (!uuid(id)) throw new Error("400 bad discard");
  const { error } = await sb.from("sessions").delete().eq("owner_id", userId).eq("id", id as string);
  fail(error, "session discard");
}
