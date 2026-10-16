/**
 * Conflict card rules (AT-21, 05-web-platform §2: 409 → Conflict card, never silent).
 * Pure helpers; the reads/writes live in conflict-actions.ts.
 */
import type { OutboxItem } from "./outbox";
import { GOAL_LEVEL, LEVEL_LABEL, ROUTINE_SAVE, type GoalLevel } from "./plan";
import { SESSION_FINISH, SESSION_START, SET_LOG_EDIT } from "./workout";
import { ONBOARDING_KIND } from "./onboarding";

export const CONFLICT_KINDS = [GOAL_LEVEL, SET_LOG_EDIT, SESSION_FINISH, ROUTINE_SAVE, ONBOARDING_KIND] as const;
export const isResolvable = (i: OutboxItem) => i.status === "conflict" && (CONFLICT_KINDS as readonly string[]).includes(i.kind);

/** True while an unsent session start was built on this routine version, so the save can't be dropped. */
export function versionInUse(items: OutboxItem[], versionId: string) {
  return items.some((i) => i.kind === SESSION_START && i.status !== "synced"
    && (i.payload as { snapshot?: { templateVersionId?: string } } | null)?.snapshot?.templateVersionId === versionId);
}

/** A conflict with no card can't be resolved by the user, so Retry requeues it. */
export const hasCard = (kind: string) => (CONFLICT_KINDS as readonly string[]).includes(kind);

export type Fields = Partial<Record<"onboarding_status" | "id" | "setKey" | "version" | "level" | "reps" | "load" | "rir" | "feedback" | "completion" | "feeling" | "note", unknown>>;

const v = (x: unknown, unit = "") => (x === null || x === undefined || x === "" ? "—" : `${x}${unit}`);

/** "Compare": the fields this item changes, as yours vs theirs lines. */
export function compareRows(kind: string, yours: Fields, theirs: Fields | null): { label: string; yours: string; theirs: string }[] {
  const t = theirs ?? {};
  if (kind === GOAL_LEVEL) {
    const l = (x: unknown) => (x ? LEVEL_LABEL[x as GoalLevel] ?? String(x) : "—");
    return [{ label: "Goal level", yours: l(yours.level), theirs: l(t.level) }];
  }
  if (kind === SET_LOG_EDIT) {
    return [
      { label: "Reps", yours: v(yours.reps), theirs: v(t.reps) },
      { label: "Load", yours: v(yours.load), theirs: v(t.load) },
      { label: "Reps in reserve", yours: v(yours.rir), theirs: v(t.rir) },
    ];
  }
  if (kind === SESSION_FINISH) {
    const fb = (t.feedback ?? {}) as { feeling?: unknown; note?: unknown };
    return [
      { label: "Ended as", yours: v(yours.completion), theirs: v(t.completion) },
      { label: "Feeling", yours: v(yours.feeling), theirs: v(fb.feeling) },
      { label: "Note", yours: v(yours.note), theirs: v(fb.note) },
    ];
  }
  if (kind === ONBOARDING_KIND) {
    return [{ label: "Setup", yours: "Done", theirs: t.onboarding_status === "done" ? "Done" : v(t.onboarding_status) }];
  }
  return [];
}
