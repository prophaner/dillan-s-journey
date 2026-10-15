import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { OnboardingPayload } from "./onboarding";

/**
 * Stores onboarding answers as the signed-in user (RLS applies).
 * Idempotent: every row carries a key derived from the outbox item's key,
 * and a replay after success is recognised by onboarding_status = 'done'.
 */
export async function storeOnboarding(
  sb: SupabaseClient<Database>,
  userId: string,
  key: string,
  expectedVersion: number,
  p: OnboardingPayload,
) {
  const { data: prof, error: pErr } = await sb
    .from("profiles").select("version, onboarding_status").eq("id", userId).single();
  if (pErr || !prof) throw new Error(`retry: profile read failed`);
  if (prof.onboarding_status === "done") return; // already stored on an earlier attempt

  const idem = { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true } as const;
  const check = (e: { message: string } | null) => {
    if (e) throw new Error(`retry: ${e.message}`);
  };

  if (p.goals.length) {
    const { error } = await sb.from("goals").upsert(
      p.goals.map((g, i) => ({
        owner_id: userId, title: g.title, user_words: g.userWords, priority: i + 1,
        source: "user" as const, idempotency_key: `${key}:goal:${i}`,
      })), idem);
    check(error);
  }
  if (p.equipment.length) {
    const { error } = await sb.from("equipment_items").upsert(
      p.equipment.map((e, i) => ({
        owner_id: userId, type: e.type, label: e.label, detail: e.detail, quantity: e.quantity,
        source: "user" as const, idempotency_key: `${key}:equip:${i}`,
      })), idem);
    check(error);
  }
  if (p.limitations.length) {
    const { error } = await sb.from("limitations").upsert(
      p.limitations.map((l, i) => ({
        owner_id: userId, category: l.category, location: l.location, side: l.side,
        origin: "onboarding", source: "user" as const, idempotency_key: `${key}:lim:${i}`,
      })), idem);
    check(error);
  }
  if (p.routine) {
    const rk = `${key}:routine`;
    const { error } = await sb.from("routine_template_versions").upsert({
      owner_id: userId, routine_id: crypto.randomUUID(), version_no: 1, title: p.routine.title,
      purpose: "Entered during onboarding, as you already do it.", status: "approved",
      source: "user", idempotency_key: rk,
    }, idem);
    check(error);
    const { data: rtv, error: rErr } = await sb
      .from("routine_template_versions").select("id").eq("owner_id", userId).eq("idempotency_key", rk).single();
    if (rErr || !rtv) throw new Error("retry: routine read failed");
    const { error: bErr } = await sb.from("routine_blocks").upsert(
      p.routine.rows.map((r, i) => ({
        owner_id: userId, template_version_id: rtv.id, position: i + 1, block_type: "single",
        rounds: 1, priority: "main",
        prescriptions: [{ name: r.name, sets: r.sets, reps: r.reps, load: r.load, unit: r.unit }],
      })), { onConflict: "template_version_id,position", ignoreDuplicates: true });
    check(bErr);
    // A real routine replaces the synthetic demo in one action.
    const { error: dErr } = await sb.rpc("delete_my_demo_data");
    check(dErr);
  }

  const { data: updated, error: uErr } = await sb.from("profiles").update({
    days_per_week: p.daysPerWeek,
    session_minutes: p.sessionMinutes,
    limitations_answer: p.limitationsAnswer,
    onboarding_status: "done",
    onboarding_step: 7,
    version: expectedVersion,
  }).eq("id", userId).select("version");
  if (uErr) {
    if (uErr.code === "40001" || /version conflict/i.test(uErr.message)) throw new Error("409 conflict: profile changed elsewhere");
    throw new Error(`retry: ${uErr.message}`);
  }
  if (!updated?.length) throw new Error("retry: profile not updated");
}
