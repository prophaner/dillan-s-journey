import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { GOAL_LEVELS, validateRoutineSave, type GoalLevel } from "./plan";

type SB = SupabaseClient<Database>;
const fail = (e: { message: string } | null, what: string) => {
  if (e) throw new Error(`retry: ${what}: ${e.message}`);
};
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Goal level (FR-02). Sends the version it read; a replay of a stored change is a no-op. */
export async function storeGoalLevel(sb: SB, userId: string, version: number, raw: unknown) {
  const p = raw as { id?: unknown; level?: unknown };
  if (!uuid(p?.id) || !(p.level === null || GOAL_LEVELS.includes(p.level as GoalLevel))) throw new Error("400 bad goal level");
  const { data, error } = await sb.from("goals").update({ level: p.level as GoalLevel | null, version })
    .eq("id", p.id as string).eq("owner_id", userId).select("id");
  if (error) {
    if (error.code === "40001" || /version conflict/i.test(error.message)) {
      const { data: cur } = await sb.from("goals").select("level").eq("id", p.id as string).maybeSingle();
      if (cur && cur.level === p.level) return;
      throw new Error("409 conflict: goal changed elsewhere");
    }
    fail(error, "goal level");
  }
  if (!data?.length) throw new Error("400 goal not found");
}

/**
 * "Save as vN+1" (AT-03): a new version row + its blocks, then locked. Earlier versions and
 * session snapshots are never touched. Idempotent on (owner, idempotency key).
 */
export async function storeRoutineVersion(sb: SB, userId: string, key: string, raw: unknown) {
  const p = validateRoutineSave(raw);
  const { data: existing, error: eErr } = await sb.from("routine_template_versions")
    .select("id, locked_at").eq("owner_id", userId).eq("idempotency_key", key).maybeSingle();
  fail(eErr, "version read");
  if (existing?.locked_at) return; // already stored
  if (existing) await sb.from("routine_template_versions").delete().eq("id", existing.id).eq("owner_id", userId); // half-written earlier try

  const { data: base, error: bErr } = await sb.from("routine_template_versions")
    .select("id, routine_id, version_no").eq("id", p.baseVersionId).eq("owner_id", userId).maybeSingle();
  fail(bErr, "base read");
  if (!base || base.routine_id !== p.routineId) throw new Error("400 base version not found");
  const { data: newest } = await sb.from("routine_template_versions").select("version_no")
    .eq("routine_id", p.routineId).eq("owner_id", userId).order("version_no", { ascending: false }).limit(1);
  if ((newest?.[0]?.version_no ?? 0) !== p.baseVersionNo) throw new Error("409 conflict: a newer version was saved elsewhere");

  // Exercise ids: library match or your own custom exercise (never by name only).
  const blocks = [];
  for (const b of p.blocks) {
    const prescriptions = [];
    for (const x of b.prescriptions) {
      let id = uuid(x.exercise_id) ? x.exercise_id : null;
      if (!id) {
        const { data, error } = await sb.rpc("resolve_exercise_id", { _name: x.name.trim() });
        fail(error, "exercise");
        id = data;
      }
      prescriptions.push({ ...x, exercise_id: id, name: x.name.trim() });
    }
    blocks.push({ ...b, prescriptions });
  }

  const { error: iErr } = await sb.from("routine_template_versions").insert({
    id: p.id, owner_id: userId, routine_id: p.routineId, version_no: p.baseVersionNo + 1, title: p.title,
    purpose: p.purpose, status: "approved", source: "user", is_demo: p.isDemo, idempotency_key: key,
  });
  if (iErr) {
    if (iErr.code === "23505") throw new Error("409 conflict: that version number already exists");
    fail(iErr, "version insert");
  }
  const { error: blErr } = await sb.from("routine_blocks").insert(blocks.map((b) => ({
    owner_id: userId, template_version_id: p.id, position: b.position, block_type: b.blockType, rounds: b.rounds,
    rest_seconds: b.restSeconds, priority: b.priority, prescriptions: b.prescriptions as unknown as Json, is_demo: p.isDemo,
  })));
  if (blErr) {
    await sb.from("routine_template_versions").delete().eq("id", p.id).eq("owner_id", userId);
    fail(blErr, "blocks insert");
  }
  const { data: locked, error: lErr } = await sb.from("routine_template_versions")
    .update({ locked_at: new Date().toISOString(), version: 1 }).eq("id", p.id).eq("owner_id", userId).select("id");
  fail(lErr, "version lock");
  if (!locked?.length) throw new Error("retry: version not locked");
}
