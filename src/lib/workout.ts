/**
 * Workout slice (S16 → S04 → S05 → S07): plan snapshot, steps, and session summary.
 * Pure functions only, so the rules can be unit-tested.
 */
export const SESSION_START = "session:start";
export const SET_LOG = "set_log";
export const SET_LOG_DELETE = "delete:set_logs";
export const SESSION_FINISH = "update:sessions";
export const DEFAULT_REST_SECONDS = 90;

export interface Prescription {
  exercise_id: string;
  name: string;
  sets?: number | null;
  reps?: number | null;
  load?: number | null;
  unit?: "lb" | "kg";
  rir?: number | null;
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
  restSeconds: number;
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
        sets: Math.max(1, p.sets ?? b.rounds ?? 1),
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
