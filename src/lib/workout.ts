/**
 * Workout slice (S16 → S04 → S05 → S07): plan snapshot, steps, and session summary.
 * Pure functions only, so the rules can be unit-tested.
 */
export const SESSION_START = "session:start";
export const SET_LOG = "set_log";
export const SET_LOG_DELETE = "delete:set_logs";
export const SESSION_FINISH = "update:sessions";
export const SET_LOG_EDIT = "update:set_logs";
export const SESSION_DISCARD = "delete:sessions";
export const DEFAULT_REST_SECONDS = 90;
/** Rest between A and B in a superset when the plan doesn't say (S06 example: 20s). */
export const DEFAULT_TRANSITION_SECONDS = 20;

export interface Prescription {
  exercise_id: string;
  name: string;
  sets?: number | null;
  reps?: number | null;
  load?: number | null;
  unit?: "lb" | "kg";
  rir?: number | null;
  /** Superset only: rest after this exercise before the next one in the round. */
  transition_seconds?: number | null;
}

export interface SnapshotBlock {
  position: number;
  blockType: string;
  priority: string;
  rounds: number;
  restSeconds: number | null;
  prescriptions: Prescription[];
}

/** Frozen copy of the plan version the session ran against. */
export interface PlanSnapshot {
  templateVersionId: string;
  routineId: string;
  versionNo: number;
  title: string;
  isDemo: boolean;
  blocks: SnapshotBlock[];
}

export interface Step {
  ref: string; // "<block position>:<index>" — stored as set_logs.prescription_ref
  blockPosition: number;
  priority: string;
  exerciseId: string;
  name: string;
  sets: number;
  reps: number | null;
  load: number | null;
  unit: "lb" | "kg";
  restSeconds: number; // straight sets: between sets · superset: after the round
  blockType: string;
  transitionSeconds: number; // superset only: between this exercise and the next
  /** Name in the plan; differs from `name` only when swapped for this session. */
  plannedName: string;
}

export function stepsOf(s: PlanSnapshot, defaultUnit: "lb" | "kg" = "lb"): Step[] {
  return [...s.blocks]
    .sort((a, b) => a.position - b.position)
    .flatMap((b) =>
      b.prescriptions.map((p, i) => ({
        ref: `${b.position}:${i}`,
        blockPosition: b.position,
        priority: b.priority,
        exerciseId: p.exercise_id,
        name: p.name,
        plannedName: p.name,
        blockType: b.blockType,
        transitionSeconds: p.transition_seconds ?? DEFAULT_TRANSITION_SECONDS,
        // In a superset every exercise is done once per round.
        sets: b.blockType === "superset" ? Math.max(1, b.rounds ?? 1) : Math.max(1, p.sets ?? b.rounds ?? 1),
        reps: p.reps ?? null,
        load: p.load ?? null,
        unit: p.unit ?? defaultUnit,
        restSeconds: b.restSeconds ?? DEFAULT_REST_SECONDS,
      })),
    );
}

export interface LoggedSet {
  key: string; // idempotency key of the outbox item that stores it
  ref: string;
  setNo: number;
  reps: number | null;
  load: number | null;
  unit: "lb" | "kg";
  rir: number | null;
  loggedAt: string;
  /** Server row version this device last wrote; starts at 1. */
  version?: number;
  exerciseId?: string;
}

export type Completion = "complete" | "partial" | "stopped";

export function completionOf(steps: Step[], logs: LoggedSet[], stopped: boolean): Completion {
  if (stopped) return "stopped";
  const planned = steps.reduce((n, s) => n + s.sets, 0);
  return logs.length >= planned && planned > 0 ? "complete" : "partial";
}

export function headlineFor(c: Completion) {
  if (c === "complete") return "Every set, done. Good, steady work.";
  if (c === "stopped") return "Stopping was the right call. Your sets are saved.";
  return "Logged as you did it. What you did still counts.";
}

export type StepResult = { kind: "done" } | { kind: "partial"; done: number; of: number } | { kind: "skipped" };

export function stepResult(step: Step, logs: LoggedSet[]): StepResult {
  const done = logs.filter((l) => l.ref === step.ref).length;
  if (done === 0) return { kind: "skipped" };
  if (done >= step.sets) return { kind: "done" };
  return { kind: "partial", done, of: step.sets };
}

/** Calendar date where the user is, not UTC. */
export function localDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ignore a second Log tap within 1 s (FR-07: no duplicate sets). */
export function isDoubleTap(lastAt: number | null, now: number) {
  return lastAt !== null && now - lastAt < 1000;
}

/** Swaps apply to this session only; the plan snapshot is never touched. */
export type Swaps = Record<string, { exerciseId: string; name: string }>;

export function applySwaps(steps: Step[], swaps: Swaps | undefined): Step[] {
  if (!swaps) return steps;
  return steps.map((s) => (swaps[s.ref] ? { ...s, exerciseId: swaps[s.ref]!.exerciseId, name: swaps[s.ref]!.name } : s));
}

/** One thing to do: a single set of one exercise. */
export interface Turn {
  step: Step;
  stepIndex: number;
  setNo: number;
  round: number | null; // superset only
  rounds: number | null;
  restAfter: number; // seconds of rest after this set (0 = none)
}

/** Order of work: straight sets back to back; supersets go A → B each round. */
export function turnsOf(steps: Step[]): Turn[] {
  const out: Turn[] = [];
  for (let i = 0; i < steps.length; ) {
    const s = steps[i]!;
    if (s.blockType !== "superset") {
      for (let n = 1; n <= s.sets; n++) out.push({ step: s, stepIndex: i, setNo: n, round: null, rounds: null, restAfter: s.restSeconds });
      i++;
      continue;
    }
    let j = i;
    while (j < steps.length && steps[j]!.blockPosition === s.blockPosition) j++;
    const group = steps.slice(i, j);
    const rounds = Math.max(...group.map((g) => g.sets));
    for (let r = 1; r <= rounds; r++) {
      group.forEach((g, k) => {
        if (r > g.sets) return;
        const lastInRound = k === group.length - 1;
        out.push({ step: g, stepIndex: i + k, setNo: r, round: r, rounds, restAfter: lastInRound ? g.restSeconds : g.transitionSeconds });
      });
    }
    i = j;
  }
  if (out.length) out[out.length - 1] = { ...out[out.length - 1]!, restAfter: 0 };
  return out;
}

/** The first set in order that hasn't been logged; undefined when everything is done. */
export function nextTurn(turns: Turn[], logs: LoggedSet[]): Turn | undefined {
  const have = new Set(logs.map((l) => `${l.ref}#${l.setNo}`));
  return turns.find((t) => !have.has(`${t.step.ref}#${t.setNo}`));
}

/** "Go A → B · rest 20s between · 75s after the round." */
export function supersetPattern(group: Step[]) {
  const letters = group.map((_, i) => String.fromCharCode(65 + i)).join(" → ");
  const between = group[0]?.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
  const after = group[group.length - 1]?.restSeconds ?? DEFAULT_REST_SECONDS;
  return `Go ${letters} · rest ${between}s between · ${after}s after the round.`;
}

/** S11: a "Something feels off" report, saved as a dated limitation linked to the exercise. */
export const SESSION_OFF_REPORT = "limitation:session_report";
export const OFF_AREAS = ["Shoulder", "Elbow", "Wrist", "Neck", "Back", "Hip", "Knee", "Ankle", "Other"] as const;
export const OFF_SIDES = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "both", label: "Both" },
] as const;
export type OffAction = "stop_exercise" | "gentler" | "end_session";

/** "Stop this exercise": its remaining sets drop out; sets already done are kept. */
export function activeTurns(turns: Turn[], skipped: string[] | undefined): Turn[] {
  if (!skipped?.length) return turns;
  const out = turns.filter((t) => !skipped.includes(t.step.ref));
  if (out.length) out[out.length - 1] = { ...out[out.length - 1]!, restAfter: 0 };
  return out;
}

/** Minimal outbox item shape, so this stays a pure function. */
export interface QueuedWrite {
  kind: string;
  idempotencyKey: string;
  payload: unknown;
  expectedVersion: number | null;
}

/**
 * Draft load: the outbox is the record of what was logged. A set queued before a failed
 * draft save shows once (never re-logged); an undo or edit already queued is applied.
 */
export function reconcileLogs(logs: LoggedSet[], items: QueuedWrite[], sessionId: string): LoggedSet[] {
  const mine = items.filter((i) => (i.payload as { sessionId?: string } | null)?.sessionId === sessionId);
  const deleted = new Set(mine.filter((i) => i.kind === SET_LOG_DELETE).map((i) => (i.payload as { setKey: string }).setKey));
  const have = new Set(logs.map((l) => l.key));
  let out = logs.filter((l) => !deleted.has(l.key));
  let changed = out.length !== logs.length;
  for (const i of mine) {
    if (i.kind !== SET_LOG || have.has(i.idempotencyKey) || deleted.has(i.idempotencyKey)) continue;
    const p = i.payload as { ref: string; setNo: number; reps: number | null; load: number | null; unit: "lb" | "kg"; rir: number | null; loggedAt: string; exerciseId?: string };
    out.push({ key: i.idempotencyKey, ref: p.ref, setNo: p.setNo, reps: p.reps, load: p.load, unit: p.unit, rir: p.rir, loggedAt: p.loggedAt, version: 1, exerciseId: p.exerciseId });
    have.add(i.idempotencyKey);
    changed = true;
  }
  for (const i of mine) {
    if (i.kind !== SET_LOG_EDIT) continue;
    const p = i.payload as { setKey: string; reps: number | null; load: number | null; rir: number | null };
    const v = (i.expectedVersion ?? 1) + 1;
    out = out.map((l) => {
      if (l.key !== p.setKey || (l.version ?? 1) >= v) return l;
      changed = true;
      return { ...l, reps: p.reps, load: p.load, rir: p.rir, version: v };
    });
  }
  return changed ? out : logs;
}
