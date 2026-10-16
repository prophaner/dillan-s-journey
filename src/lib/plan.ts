/**
 * Plan + Routine editor (D02, FR-05, FR-02, AT-03). Pure helpers shared by screens, server and tests.
 * Saving never edits a version: it creates version N+1. Past sessions keep their frozen snapshot.
 */
import type { PlanSnapshot, Prescription, SnapshotBlock } from "./workout";
import { DEFAULT_REST_SECONDS, DEFAULT_TRANSITION_SECONDS } from "./workout";

export const GOAL_LEVEL = "update:goals";
export const ROUTINE_SAVE = "routine:save_version";

export type GoalLevel = "improve" | "maintain" | "defer";
export const GOAL_LEVELS: GoalLevel[] = ["improve", "maintain", "defer"];
export const LEVEL_LABEL: Record<GoalLevel, string> = { improve: "Improve", maintain: "Maintain", defer: "Defer" };

export type BlockPriority = "main" | "priority" | "optional";
export const PRIORITY_LABEL: Record<BlockPriority, string> = { main: "Required", priority: "Priority", optional: "Optional" };

export interface EditBlock extends SnapshotBlock {
  key: string;
}

let n = 0;
const k = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;

export function toEdit(s: PlanSnapshot): EditBlock[] {
  return [...s.blocks].sort((a, b) => a.position - b.position).map((b) => ({ ...b, prescriptions: b.prescriptions.map((p) => ({ ...p })), key: k() }));
}

/** Positions are 1..n in screen order. */
export function toBlocks(eb: EditBlock[]): SnapshotBlock[] {
  return eb.map(({ key: _k, ...b }, i) => ({ ...b, position: i + 1 }));
}

export function move(eb: EditBlock[], i: number, dir: -1 | 1): EditBlock[] {
  const j = i + dir;
  if (j < 0 || j >= eb.length) return eb;
  const out = [...eb];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** "Group with next": two blocks become one superset; rounds = the larger set count. */
export function groupWithNext(eb: EditBlock[], i: number): EditBlock[] {
  const a = eb[i], b = eb[i + 1];
  if (!a || !b) return eb;
  const ps = [...a.prescriptions, ...b.prescriptions];
  const rounds = Math.max(a.blockType === "superset" ? a.rounds : 1, b.blockType === "superset" ? b.rounds : 1, ...ps.map((p) => p.sets ?? 1));
  const merged: EditBlock = {
    ...a, blockType: "superset", rounds, restSeconds: b.restSeconds ?? a.restSeconds ?? DEFAULT_REST_SECONDS,
    prescriptions: ps.map((p, idx) => ({ ...p, sets: null, transition_seconds: idx < ps.length - 1 ? (p.transition_seconds ?? DEFAULT_TRANSITION_SECONDS) : null })),
  };
  return [...eb.slice(0, i), merged, ...eb.slice(i + 2)];
}

/** Ungroup: each exercise becomes its own straight-sets block, sets = rounds. */
export function ungroup(eb: EditBlock[], i: number): EditBlock[] {
  const g = eb[i];
  if (!g || g.blockType !== "superset") return eb;
  const parts: EditBlock[] = g.prescriptions.map((p) => ({
    ...g, key: k(), blockType: "single", rounds: 1,
    prescriptions: [{ ...p, sets: g.rounds, transition_seconds: null }],
  }));
  return [...eb.slice(0, i), ...parts, ...eb.slice(i + 1)];
}

export function newBlock(name: string, unit: "lb" | "kg"): EditBlock {
  return { key: k(), position: 0, blockType: "single", priority: "main", rounds: 1, restSeconds: DEFAULT_REST_SECONDS,
    prescriptions: [{ exercise_id: "", name: name.trim(), sets: 3, reps: 10, load: null, unit }] };
}

/** Problems that block saving, in plain words. Empty = ok. */
export function problems(eb: EditBlock[]): string[] {
  const out: string[] = [];
  if (!eb.length) out.push("Add at least one exercise.");
  eb.forEach((b, i) => {
    if (!b.prescriptions.length) out.push(`Block ${i + 1} has no exercises.`);
    if (b.blockType === "superset" && (b.rounds < 1 || b.rounds > 20)) out.push(`Block ${i + 1}: rounds must be 1–20.`);
    for (const p of b.prescriptions) {
      if (!p.name.trim()) out.push(`Block ${i + 1}: an exercise needs a name.`);
      if (b.blockType !== "superset" && (!p.sets || p.sets < 1 || p.sets > 20)) out.push(`${p.name || "Exercise"}: sets must be 1–20.`);
    }
  });
  return out;
}

const fmt = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : `${v}${unit}`);

/** "What changed from vN": plain-language diff, matched by exercise id (or name when new). */
export function diffPlans(base: SnapshotBlock[], next: SnapshotBlock[]): string[] {
  const out: string[] = [];
  const idOf = (p: Prescription) => p.exercise_id || `name:${p.name.trim().toLowerCase()}`;
  const flat = (bs: SnapshotBlock[]) => [...bs].sort((a, b) => a.position - b.position)
    .flatMap((b, bi) => b.prescriptions.map((p) => ({ p, b, bi })));
  // Key = exercise + occurrence, so the same exercise in two blocks diffs as two entries.
  const keyed = (bs: SnapshotBlock[]) => {
    const seen = new Map<string, number>();
    return flat(bs).map((x) => {
      const id = idOf(x.p);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return [`${id}#${n}`, x] as const;
    });
  };
  const before = new Map(keyed(base));
  const after = new Map(keyed(next));
  for (const [id, x] of after) {
    const y = before.get(id);
    const nm = x.p.name;
    if (!y) { out.push(`Added ${nm}`); continue; }
    const sup = x.b.blockType === "superset";
    if (!sup && (y.p.sets ?? null) !== (x.p.sets ?? null)) out.push(`${nm}: sets ${fmt(y.p.sets)} → ${fmt(x.p.sets)}`);
    if ((y.p.reps ?? null) !== (x.p.reps ?? null)) out.push(`${nm}: reps ${fmt(y.p.reps)} → ${fmt(x.p.reps)}`);
    if ((y.p.load ?? null) !== (x.p.load ?? null)) out.push(`${nm}: load ${fmt(y.p.load, ` ${y.p.unit ?? ""}`.trimEnd())} → ${fmt(x.p.load, ` ${x.p.unit ?? ""}`.trimEnd())}`);
    if (y.b.blockType !== x.b.blockType) out.push(sup ? `${nm}: now in a superset` : `${nm}: no longer in a superset`);
    if (!sup && (y.b.restSeconds ?? null) !== (x.b.restSeconds ?? null)) out.push(`${nm}: rest ${fmt(y.b.restSeconds, "s")} → ${fmt(x.b.restSeconds, "s")}`);
    if (y.b.priority !== x.b.priority) out.push(`${nm}: ${PRIORITY_LABEL[y.b.priority as BlockPriority] ?? y.b.priority} → ${PRIORITY_LABEL[x.b.priority as BlockPriority] ?? x.b.priority}`);
    if (y.bi !== x.bi) out.push(`${nm}: moved to position ${x.bi + 1}`);
  }
  for (const [id, y] of before) if (!after.has(id)) out.push(`Removed ${y.p.name}`);
  // Superset-level changes, reported once per group.
  for (const b of next.filter((b) => b.blockType === "superset")) {
    const ids = b.prescriptions.map(idOf).join("+");
    const old = base.find((o) => o.blockType === "superset" && o.prescriptions.map(idOf).join("+") === ids);
    if (!old) continue;
    const label = b.prescriptions.map((p) => p.name).join(" + ");
    if (old.rounds !== b.rounds) out.push(`${label}: rounds ${old.rounds} → ${b.rounds}`);
    if ((old.restSeconds ?? null) !== (b.restSeconds ?? null)) out.push(`${label}: round rest ${fmt(old.restSeconds, "s")} → ${fmt(b.restSeconds, "s")}`);
    const ot = old.prescriptions[0]?.transition_seconds ?? DEFAULT_TRANSITION_SECONDS;
    const nt = b.prescriptions[0]?.transition_seconds ?? DEFAULT_TRANSITION_SECONDS;
    if (ot !== nt) out.push(`${label}: rest between ${ot}s → ${nt}s`);
  }
  return out;
}

export interface RoutineSavePayload {
  /** New version id, made on this device so Train can use it offline. */
  id: string;
  routineId: string;
  baseVersionId: string;
  baseVersionNo: number;
  title: string;
  purpose: string | null;
  isDemo: boolean;
  reason: string | null;
  blocks: SnapshotBlock[];
}

const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const numOrNull = (v: unknown, hi: number) => v === null || v === undefined || (typeof v === "number" && v >= 0 && v <= hi);

export function validateRoutineSave(raw: unknown): RoutineSavePayload {
  const p = raw as Partial<RoutineSavePayload> | null;
  if (!p || !uuid(p.id) || !uuid(p.routineId) || !uuid(p.baseVersionId) || !int(p.baseVersionNo, 1, 100000)) throw new Error("400 bad routine save");
  if (typeof p.title !== "string" || !p.title.trim()) throw new Error("400 title required");
  if (!Array.isArray(p.blocks) || !p.blocks.length || p.blocks.length > 40) throw new Error("400 bad blocks");
  for (const b of p.blocks) {
    if (!["single", "superset", "circuit", "warmup", "cooldown"].includes(b.blockType)) throw new Error("400 bad block type");
    if (!["main", "priority", "optional"].includes(b.priority)) throw new Error("400 bad priority");
    if (!int(b.rounds, 1, 20) || !numOrNull(b.restSeconds, 900)) throw new Error("400 bad block numbers");
    if (!Array.isArray(b.prescriptions) || !b.prescriptions.length || b.prescriptions.length > 10) throw new Error("400 bad prescriptions");
    for (const x of b.prescriptions) {
      if (typeof x.name !== "string" || !x.name.trim()) throw new Error("400 exercise name required");
      if (!(x.sets === null || x.sets === undefined || int(x.sets, 1, 20))) throw new Error("400 bad sets");
      if (!(x.reps === null || x.reps === undefined || int(x.reps, 1, 1000))) throw new Error("400 bad reps");
      if (!numOrNull(x.load, 2000) || !numOrNull(x.transition_seconds, 600)) throw new Error("400 bad load");
    }
  }
  const prios = p.blocks.filter((b) => b.priority === "priority").length;
  if (prios > 1) throw new Error("400 only one priority block");
  return { ...(p as RoutineSavePayload), title: p.title.trim().slice(0, 120), reason: typeof p.reason === "string" && p.reason.trim() ? p.reason.trim().slice(0, 300) : null };
}

/** Content badge for an exercise (FR-05: reviewed vs user-created). */
export function exerciseBadge(e: { owner_id: string | null; review_status: string }, uid: string): "Reviewed" | "Yours" | "Not reviewed" {
  if (e.owner_id === uid) return "Yours";
  if (e.owner_id === null && e.review_status === "reviewed") return "Reviewed";
  return "Not reviewed";
}
