import { supabase } from "@/integrations/supabase/client";
import { deleteDraft, enqueue, removeIfLocal, saveDraft, type OutboxItem } from "./outbox";
import { diffPlans, GOAL_LEVEL, ROUTINE_SAVE, toEdit, type RoutineSavePayload } from "./plan";
import { SESSION_FINISH, SET_LOG_EDIT } from "./workout";
import { loadRoutine, planDraftKey } from "./workout-store";
import { compareRows } from "./conflicts";

/** Current server row for a conflicting update (what "theirs" is). */
export async function readTheirs(item: OutboxItem): Promise<Record<string, unknown> | null> {
  const p = item.payload as Record<string, string>;
  if (item.kind === GOAL_LEVEL) {
    const { data, error } = await supabase.from("goals").select("version, level").eq("id", p.id!).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (item.kind === SET_LOG_EDIT) {
    const { data, error } = await supabase.from("set_logs").select("version, reps, load, rir").eq("owner_id", item.accountId).eq("idempotency_key", p.setKey!).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (item.kind === SESSION_FINISH) {
    const { data, error } = await supabase.from("sessions").select("version, completion, feedback").eq("id", p.id!).maybeSingle();
    if (error) throw error;
    return data as Record<string, unknown> | null;
  }
  return null;
}

export async function compare(item: OutboxItem) {
  if (item.kind === ROUTINE_SAVE) {
    const p = item.payload as RoutineSavePayload;
    const fresh = await loadRoutine(item.accountId);
    return { rows: [], lines: fresh ? diffPlans(fresh.blocks, p.blocks) : [], theirsLabel: fresh ? `v${fresh.versionNo}` : "—" };
  }
  return { rows: compareRows(item.kind, item.payload as Record<string, unknown>, await readTheirs(item)), lines: [], theirsLabel: "" };
}

/** Turn a routine save back into a draft against the newest stored version. Draft is written first. */
export async function rebaseRoutineSave(item: OutboxItem): Promise<boolean> {
  const p = item.payload as RoutineSavePayload;
  const fresh = await loadRoutine(item.accountId);
  if (!fresh) return false;
  const key = planDraftKey(item.accountId);
  await saveDraft(key, { baseVersionId: fresh.templateVersionId, blocks: toEdit({ ...fresh, blocks: p.blocks }), reason: p.reason ?? "" });
  if (!(await removeIfLocal(item.localId))) {
    await deleteDraft(key);
    return false;
  }
  return true;
}

/** Keep yours: re-read the row's version and resend your change with it. Never a silent overwrite: the user chose it. */
export async function keepYours(item: OutboxItem): Promise<"sent" | "draft" | "gone"> {
  if (item.kind === ROUTINE_SAVE) return (await rebaseRoutineSave(item)) ? "draft" : "gone";
  const cur = await readTheirs(item);
  if (!cur || typeof cur.version !== "number") {
    await removeIfLocal(item.localId);
    return "gone"; // the row no longer exists
  }
  await enqueue(item.accountId, item.kind, item.payload, cur.version);
  await removeIfLocal(item.localId);
  return "sent";
}

/** Keep theirs: drop your change from this device. The caller refetches. */
export async function keepTheirs(item: OutboxItem) {
  const ok = await removeIfLocal(item.localId);
  if (ok && item.kind === ROUTINE_SAVE) await deleteDraft(planDraftKey(item.accountId));
  return ok;
}
