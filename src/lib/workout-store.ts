import { supabase } from "@/integrations/supabase/client";
import { deleteDraft, listDraftKeys, loadDraft, saveDraft } from "./outbox";
import { localDate, type LoggedSet, type PlanSnapshot, type Prescription, type Swaps } from "./workout";

/** Everything a running session needs, kept in IndexedDB so reloads and locked screens lose nothing. */
export interface SessionDraft {
  id: string;
  snapshot: PlanSnapshot;
  startedAt: number;
  stepIndex: number;
  logs: LoggedSet[];
  restStartedAt: number | null;
  restTotalMs: number;
  phase: "training" | "done";
  stopped: boolean;
  endedAt: number | null;
  last: Record<string, { reps: number | null; load: number | null }>;
  inputs: { reps: number; load: number | null; rir: number | null };
  /** Values being entered, per exercise (supersets switch between A and B). */
  inputsByRef?: Record<string, { reps: number; load: number | null; rir: number | null }>;
  /** This session only — the plan snapshot stays as it was. */
  swaps?: Swaps;
  feeling: string | null;
  note: string;
}

export const draftKey = (uid: string, id: string) => `session:${uid}:${id}`;
const activeKey = (uid: string) => `active-session:${uid}`;
const routineKey = (uid: string) => `routine:${uid}`;

/** Current routine: newest approved version, your own before the demo. Cached for offline. */
export async function loadRoutine(uid: string): Promise<PlanSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from("routine_template_versions")
      .select("id, routine_id, version_no, title, is_demo, routine_blocks(position, block_type, priority, rounds, rest_seconds, prescriptions)")
      .eq("owner_id", uid).eq("status", "approved").is("archived_at", null)
      .order("is_demo", { ascending: true }).order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    const v = data?.[0];
    const snap: PlanSnapshot | null = v
      ? {
          templateVersionId: v.id, routineId: v.routine_id, versionNo: v.version_no, title: v.title, isDemo: v.is_demo,
          blocks: (v.routine_blocks ?? []).map((b) => ({
            position: b.position, blockType: b.block_type, priority: b.priority, rounds: b.rounds,
            restSeconds: b.rest_seconds, prescriptions: (b.prescriptions as unknown as Prescription[]) ?? [],
          })),
        }
      : null;
    await saveDraft(routineKey(uid), snap);
    return snap;
  } catch (e) {
    const cached = await loadDraft<PlanSnapshot | null>(routineKey(uid));
    if (cached !== undefined) return cached;
    throw e;
  }
}

async function lastValues(uid: string, ids: string[]) {
  const out: SessionDraft["last"] = {};
  if (!ids.length || !navigator.onLine) return out;
  const { data } = await supabase.from("set_logs").select("exercise_id, reps, load")
    .eq("owner_id", uid).in("exercise_id", ids).order("logged_at", { ascending: false }).limit(200);
  for (const r of data ?? []) if (r.exercise_id && !out[r.exercise_id]) out[r.exercise_id] = { reps: r.reps, load: r.load };
  return out;
}

export async function getActiveSession(uid: string): Promise<SessionDraft | null> {
  const id = await loadDraft<string>(activeKey(uid));
  if (!id) return null;
  return (await loadDraft<SessionDraft>(draftKey(uid, id))) ?? null;
}

export async function saveSession(uid: string, d: SessionDraft) {
  await saveDraft(draftKey(uid, d.id), d);
}

/** Sign-out: remove every local session, active pointer, cached routine and onboarding draft for this account. */
export async function clearDrafts(uid: string) {
  const prefix = `session:${uid}:`;
  for (const key of await listDraftKeys()) if (key.startsWith(prefix)) await deleteDraft(key);
  await deleteDraft(activeKey(uid));
  await deleteDraft(routineKey(uid));
  await deleteDraft(`onboarding:${uid}`);
  await deleteDraft(exercisesKey(uid));
}

const exercisesKey = (uid: string) => `exercises:${uid}`;
/** Exercises you can swap to: the shared library and your own. Cached for offline. */
export async function loadExercises(uid: string): Promise<{ id: string; name: string }[]> {
  try {
    const { data, error } = await supabase.from("exercises").select("id, name").is("archived_at", null).order("name").limit(500);
    if (error) throw error;
    await saveDraft(exercisesKey(uid), data ?? []);
    return data ?? [];
  } catch (e) {
    const cached = await loadDraft<{ id: string; name: string }[]>(exercisesKey(uid));
    if (cached) return cached;
    throw e;
  }
}

export async function closeSession(uid: string, id: string) {
  await deleteDraft(activeKey(uid));
  await deleteDraft(draftKey(uid, id));
}

/** Creates the session on this device first; the outbox stores it on the server. */
export async function beginSession(
  uid: string,
  snapshot: PlanSnapshot,
  enqueue: (kind: string, payload: unknown) => Promise<unknown>,
): Promise<string> {
  const existing = await getActiveSession(uid);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  const ids = snapshot.blocks.flatMap((b) => b.prescriptions.map((p) => p.exercise_id)).filter(Boolean);
  const last = await lastValues(uid, ids).catch(() => ({}));
  const first = snapshot.blocks[0]?.prescriptions[0];
  const draft: SessionDraft = {
    id, snapshot, startedAt: now, stepIndex: 0, logs: [], restStartedAt: null, restTotalMs: 0,
    phase: "training", stopped: false, endedAt: null, last,
    inputs: { reps: first?.reps ?? 0, load: first?.load ?? null, rir: null }, feeling: null, note: "",
  };
  await saveSession(uid, draft);
  await saveDraft(activeKey(uid), id);
  await enqueue("session:start", {
    id, snapshot, localDate: localDate(new Date(now)),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, startedAt: new Date(now).toISOString(),
  });
  return id;
}

export interface RecentSession {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  completion: string;
  sets: number;
}

export async function loadRecent(uid: string): Promise<RecentSession[]> {
  const { data, error } = await supabase.from("sessions")
    .select("id, plan_snapshot, started_at, ended_at, completion, set_logs(count)")
    .eq("owner_id", uid).neq("completion", "in_progress").order("started_at", { ascending: false }).limit(5);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id, title: (s.plan_snapshot as { title?: string })?.title ?? "Session",
    started_at: s.started_at, ended_at: s.ended_at, completion: s.completion,
    sets: (s.set_logs as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}
