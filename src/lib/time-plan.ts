/**
 * Today (S01/S02, FR-06, AT-04): Full · Short · Priority only, built from the stored routine.
 * Pure functions so the rules can be unit-tested.
 *
 * Rules:
 * - Full keeps every block.
 * - Short keeps the required and priority blocks and leaves out the optional ones.
 * - Priority only keeps the block marked priority, or the first required one when none is marked.
 */
import type { PlanSnapshot, SnapshotBlock } from "./workout";

export type TimeChoice = "full" | "short" | "priority";

/** Recorded in the plan snapshot. The full plan stays in `blocks`; omitted ones aren't run. */
export interface TimePlan {
  choice: TimeChoice;
  omittedPositions: number[];
  estMinutes: number;
}

/** Estimate pieces, in seconds. Labelled as estimates on screen. */
export const WORK_SECONDS_PER_SET = 45;
export const SETUP_SECONDS_PER_EXERCISE = 60;

export function blockSeconds(b: SnapshotBlock): number {
  const rest = b.restSeconds ?? 90;
  const n = b.prescriptions.length;
  if (n === 0) return 0;
  if (b.blockType === "superset") {
    const rounds = Math.max(1, b.rounds ?? 1);
    const transitions = b.prescriptions.slice(0, -1).reduce((s, p) => s + (p.transition_seconds ?? 20), 0);
    return n * SETUP_SECONDS_PER_EXERCISE + rounds * (n * WORK_SECONDS_PER_SET + transitions) + (rounds - 1) * rest;
  }
  return b.prescriptions.reduce((s, p) => {
    const sets = Math.max(1, p.sets ?? b.rounds ?? 1);
    return s + SETUP_SECONDS_PER_EXERCISE + sets * WORK_SECONDS_PER_SET + (sets - 1) * rest;
  }, 0);
}

export const blockMinutes = (b: SnapshotBlock) => Math.max(1, Math.round(blockSeconds(b) / 60));

const sorted = (s: PlanSnapshot) => [...s.blocks].sort((a, b) => a.position - b.position);

export function priorityPosition(s: PlanSnapshot): number | undefined {
  const blocks = sorted(s);
  return (blocks.find((b) => b.priority === "priority") ?? blocks.find((b) => b.priority === "main") ?? blocks[0])?.position;
}

export function keptPositions(s: PlanSnapshot, choice: TimeChoice): number[] {
  const blocks = sorted(s);
  if (choice === "full") return blocks.map((b) => b.position);
  if (choice === "priority") {
    const p = priorityPosition(s);
    return p === undefined ? [] : [p];
  }
  const main = blocks.filter((b) => b.priority !== "optional").map((b) => b.position);
  return main.length ? main : blocks.slice(0, 1).map((b) => b.position);
}

export function estimateMinutes(s: PlanSnapshot, choice: TimeChoice): number {
  const keep = new Set(keptPositions(s, choice));
  const secs = s.blocks.filter((b) => keep.has(b.position)).reduce((n, b) => n + blockSeconds(b), 0);
  return secs > 0 ? Math.max(1, Math.round(secs / 60)) : 0;
}

export function timePlanOf(s: PlanSnapshot, choice: TimeChoice): TimePlan {
  const keep = new Set(keptPositions(s, choice));
  return {
    choice,
    omittedPositions: s.blocks.map((b) => b.position).filter((p) => !keep.has(p)).sort((a, b) => a - b),
    estMinutes: estimateMinutes(s, choice),
  };
}

/** The snapshot a session starts with: full plan kept, chosen version recorded (AT-04). */
export function applyTimePlan(s: PlanSnapshot, choice: TimeChoice): PlanSnapshot {
  return { ...s, timePlan: timePlanOf(s, choice) };
}

/** "Goblet squat" · "Dumbbell row + Push-up" — blocks have no names of their own yet. */
export const blockName = (b: SnapshotBlock) => b.prescriptions.map((p) => p.name).join(" + ") || `Block ${b.position}`;

/** AT-04: names the retained purpose and the omitted blocks. */
export function whyThisTrade(s: PlanSnapshot, choice: TimeChoice): string | null {
  if (choice === "full") return null;
  const keep = new Set(keptPositions(s, choice));
  const blocks = sorted(s);
  const kept = blocks.filter((b) => keep.has(b.position)).map(blockName);
  const left = blocks.filter((b) => !keep.has(b.position)).map(blockName);
  const purpose = s.purpose?.trim();
  const keptText = `Keeps ${listOf(kept)}${purpose ? `, so the purpose stays: ${purpose.replace(/\.$/, "")}` : ", your main work"}.`;
  if (!left.length) return `${keptText} Nothing to leave out — this plan has no optional blocks.`;
  return `${keptText} Leaves out ${listOf(left)}.`;
}

export function listOf(xs: string[]) {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export const choiceLabel: Record<TimeChoice, string> = { full: "Full", short: "Short", priority: "Priority only" };
