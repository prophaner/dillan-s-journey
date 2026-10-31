// Display strings for sets, loads and durations (handoff §5 canonical copy, acceptance 13).

import { exerciseForStep } from "@/v1/core/steps";
import type {
  Block,
  Exercise,
  LoadBasis,
  SetResult,
  Snapshot,
  Step,
  Unit,
  WorkoutSessionRow,
} from "@/v1/core/types";

/** "Bodyweight" | "30 lb per dumbbell" | "30 lb total" */
export function loadText(weight: number | null, unit: Unit, basis: LoadBasis | null): string {
  if (weight == null) return "Bodyweight";
  return basis === "per_implement" ? `${weight} ${unit} per dumbbell` : `${weight} ${unit} total`;
}

/** "10 reps" | "10 per side" */
export function repsText(reps: number, mode: Exercise["rep_mode"]): string {
  return mode === "per_side" ? `${reps} per side` : `${reps} reps`;
}

/** What was logged: "10 reps · 30 lb per dumbbell" | "10 reps · 30 lb total" (handoff §4.7) */
export function doneText(r: SetResult, ex: Exercise | null): string {
  const reps = r.reps ?? 0;
  const per = ex?.rep_mode === "per_side" ? " per side" : " reps";
  // Without the exercise the basis is unknown: show the bare weight rather than guess one.
  const w = ex
    ? loadText(r.weight, ex.unit, ex.load_basis)
    : r.weight == null
      ? "Bodyweight"
      : `${r.weight} lb`;
  return `${reps}${per} · ${w}`;
}

export function resultLabel(r: SetResult | undefined): "Done" | "Skipped" | "Not reached" | null {
  if (!r) return null;
  return r.status === "done" ? "Done" : r.status === "skipped" ? "Skipped" : "Not reached";
}

/** "41 min" (rounded, at least 1 when there was any activity) */
export function minutesText(ms: number): string {
  const m = Math.round(ms / 60_000);
  return `${ms > 0 && m === 0 ? 1 : m} min`;
}

/** Exercises in snapshot order, each with its steps (for summary/detail lists). */
export function exercisesWithSteps(
  snapshot: Snapshot,
  steps: Step[],
): Array<{ key: string; ex: Exercise; block: Block; steps: Step[]; label: string | null }> {
  const out: Array<{
    key: string;
    ex: Exercise;
    block: Block;
    steps: Step[];
    label: string | null;
  }> = [];
  snapshot.blocks.forEach((b, bi) => {
    const members = b.type === "straight" ? [b.exercise] : b.exercises;
    members.forEach((ex, mi) => {
      const st = steps.filter((s) => s.block === bi && s.exercise === mi);
      out.push({ key: `${bi}.${mi}`, ex, block: b, steps: st, label: st[0]?.label ?? null });
    });
  });
  return out;
}

/** "3 × 10 reps · 30 lb per dumbbell" */
export function prescribedText(block: Block, ex: Exercise): string {
  const n = block.type === "straight" ? block.sets : block.rounds;
  return `${n} × ${repsText(ex.reps, ex.rep_mode)} · ${loadText(ex.weight, ex.unit, ex.load_basis)}`;
}

/** Template one-liner for preflight: "Floor Press 3×10 · Superset A: Press + Pull-apart × 3" */
export function workoutLine(blocks: Block[]): string {
  let letter = 0;
  return blocks
    .map((b) => {
      if (b.type === "straight") return `${b.exercise.name} ${b.sets}×${b.exercise.reps}`;
      const l = String.fromCharCode(65 + letter++);
      return `Superset ${l}: ${b.exercises.map((e) => e.name).join(" + ")} × ${b.rounds}`;
    })
    .join(" · ");
}

export function counts(row: Pick<WorkoutSessionRow, "results" | "steps">) {
  let done = 0;
  let skipped = 0;
  let notReached = 0;
  for (const s of row.steps) {
    const r = row.results[s.key];
    if (r?.status === "done") done += 1;
    else if (r?.status === "skipped") skipped += 1;
    else notReached += 1;
  }
  return { done, skipped, notReached, total: row.steps.length };
}

export { exerciseForStep };

/** "Tue, Oct 27, 2026" in the given timezone */
export function formatDay(iso: string | number, tz: string, withYear = true): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
  }
}

/** "Tuesday, October 27" for a YYYY-MM-DD calendar key */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y as number, (m as number) - 1, d as number)));
}
