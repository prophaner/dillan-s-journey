import { supabase } from "@/integrations/supabase/client";
import { deleteDraft, enqueue, loadDraft, removeIfLocal, rewriteUnsent, saveDraft, type OutboxItem } from "./outbox";
import { diffPlans, GOAL_LEVEL, ROUTINE_SAVE, toEdit, type RoutineSavePayload } from "./plan";
import { SESSION_FINISH, SET_LOG_EDIT, type PlanSnapshot } from "./workout";
import { draftKey, loadRoutine, planDraftKey, type SessionDraft } from "./workout-store";
import { compareRows, versionInUse, type Fields } from "./conflicts";
import { listItems } from "./outbox";
import { ONBOARDING_KIND } from "./onboarding";
import { PROFILE_UPDATE_KINDS, tableOfUpdate, type RowUpdatePayload } from "./profile";

/** Current server row for a conflicting update (what "theirs" is). */
export async function readTheirs(item: OutboxItem): Promise<Fields | null> {
  const p = item.payload as Fields;
  if (item.kind === GOAL_LEVEL) {
    const { data, error } = await supabase.from("goals").select("version, level").eq("id", String(p.id)).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (item.kind === SET_LOG_EDIT) {
    const { data, error } = await supabase.from("set_logs").select("version, reps, load, rir").eq("owner_id", item.accountId).eq("idempotency_key", String(p.setKey)).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (item.kind === ONBOARDING_KIND) {
    const { data, error } = await supabase.from("profiles").select("version, onboarding_status").eq("id", item.accountId).maybeSingle();
    if (error) throw error;
    return data as Fields | null;
  }
  if (item.kind === SESSION_FINISH) {
    const { data, error } = await supabase.from("sessions").select("version, completion, feedback").eq("id", String(p.id)).maybeSingle();
    if (error) throw error;
    return data as Fields | null;
  }
  if ((PROFILE_UPDATE_KINDS as readonly string[]).includes(item.kind)) {
    const u = item.payload as RowUpdatePayload;
    const table = tableOfUpdate(item.kind);
    const { data, error } = await supabase.from(table).select("*").eq("id", u.id).maybeSingle();
    if (error) throw error;
    return data as unknown as Fields | null;
  }
  return null;
}

export async function compare(item: OutboxItem) {
  if (item.kind === ROUTINE_SAVE) {
    const p = item.payload as RoutineSavePayload;
    const fresh = await loadRoutine(item.accountId);
    return { rows: [], lines: fresh ? diffPlans(fresh.blocks, p.blocks) : [], theirsLabel: fresh ? `v${fresh.versionNo}` : "—" };
  }
  return { rows: compareRows(item.kind, item.payload as Fields, await readTheirs(item)), lines: [], theirsLabel: "" };
}

/**
 * A routine save a queued session depends on: rebase the save itself onto the newest stored
 * version (new version id, next number) and re-point the queued session to it. Your blocks stay.
 */
async function rebaseInPlace(item: OutboxItem, fresh: PlanSnapshot) {
  const p = item.payload as RoutineSavePayload;
  const newId = crypto.randomUUID();
  const nextNo = fresh.versionNo + 1;
  const sessions = new Set<string>();
  await rewriteUnsent(item.accountId, (i) => {
    if (i.localId === item.localId) {
      return {
        ...i, idempotencyKey: crypto.randomUUID(), status: "local", attempts: 0, error: undefined,
        payload: { ...p, id: newId, baseVersionId: fresh.templateVersionId, baseVersionNo: fresh.versionNo } satisfies RoutineSavePayload,
      };
    }
    const snap = (i.payload as { snapshot?: PlanSnapshot } | null)?.snapshot;
    if (snap?.templateVersionId === p.id) {
      const sid = (i.payload as { id?: string; sessionId?: string }).sessionId ?? (i.payload as { id?: string }).id;
      if (sid) sessions.add(sid);
      return { ...i, payload: { ...(i.payload as object), snapshot: { ...snap, templateVersionId: newId, versionNo: nextNo } } };
    }
    return null;
  });
  // The on-device copy of each session follows, so later writes carry the same version.
  for (const sid of sessions) {
    const k = draftKey(item.accountId, sid);
    const d = await loadDraft<SessionDraft>(k);
    if (d && d.snapshot.templateVersionId === p.id) await saveDraft(k, { ...d, snapshot: { ...d.snapshot, templateVersionId: newId, versionNo: nextNo } });
  }
  return nextNo;
}

/**
 * Turn a routine save back into a draft against the newest stored version. Draft is written first.
 * "rebased": an unsent session started on this version, so the save itself moves onto the newest version.
 */
export async function rebaseRoutineSave(item: OutboxItem): Promise<"draft" | "rebased" | false> {
  const p = item.payload as RoutineSavePayload;
  const fresh = await loadRoutine(item.accountId);
  if (!fresh) return false;
  if (versionInUse(await listItems(item.accountId), p.id)) {
    await rebaseInPlace(item, fresh);
    return "rebased";
  }
  const key = planDraftKey(item.accountId);
  await saveDraft(key, { baseVersionId: fresh.templateVersionId, blocks: toEdit({ ...fresh, blocks: p.blocks }), reason: p.reason ?? "" });
  if (!(await removeIfLocal(item.localId))) {
    await deleteDraft(key);
    return false;
  }
  return "draft";
}

/** Keep yours: re-read the row's version and resend your change with it. Never a silent overwrite: the user chose it. */
export async function keepYours(item: OutboxItem): Promise<"sent" | "draft" | "rebased" | "gone"> {
  if (item.kind === ROUTINE_SAVE) return (await rebaseRoutineSave(item)) || "gone";
  const cur = await readTheirs(item);
  if (!cur || typeof cur.version !== "number") {
    await removeIfLocal(item.localId);
    return "gone"; // the row no longer exists
  }
  // Onboarding is one change: its resend keeps the original key so child rows are never doubled.
  const opts = item.kind === ONBOARDING_KIND ? { idempotencyKey: item.idempotencyKey } : {};
  await removeIfLocal(item.localId);
  await enqueue(item.accountId, item.kind, item.payload, cur.version, opts);
  return "sent";
}

/** Keep theirs: drop your change from this device. The caller refetches. */
export async function keepTheirs(item: OutboxItem) {
  const ok = await removeIfLocal(item.localId);
  if (ok && item.kind === ROUTINE_SAVE) await deleteDraft(planDraftKey(item.accountId));
  return ok;
}
