// S06 editor model (pure). The draft mirrors core Block[] so validation paths from
// core/validate.ts ("blocks.1.exercises.0.reps") address draft fields 1:1. Numbers stay as the
// typed strings until toBody(); blank weight = bodyweight (null), never 0.

import type {
  Block,
  Exercise,
  LoadBasis,
  RepMode,
  TemplateBody,
  Unit,
  WorkoutTemplate,
} from "@/v1/core/types";
import { LIMITS } from "@/v1/core/validate";
import { buildSteps } from "@/v1/core/steps";
import { newId } from "@/v1/data/api";

export interface DraftExercise {
  id: string;
  name: string;
  reps: string;
  rep_mode: RepMode;
  weight: string;
  unit: Unit;
  load_basis: LoadBasis | null;
  instructions: string;
}

export type DraftBlock =
  | { type: "straight"; id: string; sets: string; rest_s: string; exercise: DraftExercise }
  | { type: "superset"; id: string; rounds: string; rest_s: string; exercises: DraftExercise[] };

export interface Draft {
  name: string;
  blocks: DraftBlock[];
}

const shortId = () => newId().replace(/-/g, "").slice(0, 16);

export function blankExercise(unit: Unit): DraftExercise {
  return {
    id: shortId(),
    name: "",
    reps: "10",
    rep_mode: "total",
    weight: "",
    unit,
    load_basis: null,
    instructions: "",
  };
}

export function blankBlock(unit: Unit): DraftBlock {
  return {
    type: "straight",
    id: shortId(),
    sets: "3",
    rest_s: String(LIMITS.restDefault),
    exercise: blankExercise(unit),
  };
}

/** New workout: one blank exercise (handoff 4.3). */
export function newDraft(unit: Unit): Draft {
  return { name: "", blocks: [blankBlock(unit)] };
}

function exFrom(e: Exercise): DraftExercise {
  return {
    id: e.id,
    name: e.name,
    reps: String(e.reps),
    rep_mode: e.rep_mode,
    weight: e.weight == null ? "" : String(e.weight),
    unit: e.unit,
    load_basis: e.load_basis,
    instructions: e.instructions ?? "",
  };
}

export function draftFromTemplate(t: TemplateBody): Draft {
  return {
    name: t.name,
    blocks: t.blocks.map((b) =>
      b.type === "straight"
        ? {
            type: "straight",
            id: b.id,
            sets: String(b.sets),
            rest_s: String(b.rest_s),
            exercise: exFrom(b.exercise),
          }
        : {
            type: "superset",
            id: b.id,
            rounds: String(b.rounds),
            rest_s: String(b.rest_s),
            exercises: b.exercises.map(exFrom),
          },
    ),
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));

function exTo(e: DraftExercise): Exercise {
  const weight = e.weight.trim() === "" ? null : num(e.weight);
  return {
    id: e.id,
    name: e.name.trim(),
    reps: num(e.reps),
    rep_mode: e.rep_mode,
    weight,
    unit: e.unit,
    load_basis: weight === null ? null : e.load_basis,
    instructions: e.instructions.trim(),
  };
}

/** The body sent to templates.create/update (and validated with core validateTemplate). */
export function toBody(d: Draft): TemplateBody {
  return {
    name: d.name.trim(),
    blocks: d.blocks.map((b): Block =>
      b.type === "straight"
        ? {
            type: "straight",
            id: b.id,
            sets: num(b.sets),
            rest_s: num(b.rest_s),
            exercise: exTo(b.exercise),
          }
        : {
            type: "superset",
            id: b.id,
            rounds: num(b.rounds),
            rest_s: num(b.rest_s),
            exercises: b.exercises.map(exTo),
          },
    ),
  };
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Superset letters in order (A, B, ...), same as core buildSteps. */
export function supersetLetters(d: Draft): Record<number, string> {
  const out: Record<number, string> = {};
  let n = 0;
  d.blocks.forEach((b, i) => {
    if (b.type === "superset") out[i] = String.fromCharCode(65 + n++);
  });
  return out;
}

export function exerciseCount(d: Draft): number {
  return d.blocks.reduce((n, b) => n + (b.type === "straight" ? 1 : b.exercises.length), 0);
}

// ----- operations (pure) -----------------------------------------------------------------

const replace = <T>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));

export function setName(d: Draft, name: string): Draft {
  return { ...d, name };
}

export function patchBlock(
  d: Draft,
  bi: number,
  patch: { sets?: string; rounds?: string; rest_s?: string },
): Draft {
  const b = d.blocks[bi];
  if (!b) return d;
  return { ...d, blocks: replace(d.blocks, bi, { ...b, ...patch } as DraftBlock) };
}

export function patchExercise(
  d: Draft,
  bi: number,
  mi: number,
  patch: Partial<DraftExercise>,
): Draft {
  const b = d.blocks[bi];
  if (!b) return d;
  const nb: DraftBlock =
    b.type === "straight"
      ? { ...b, exercise: { ...b.exercise, ...patch } }
      : {
          ...b,
          exercises: replace(b.exercises, mi, { ...(b.exercises[mi] as DraftExercise), ...patch }),
        };
  return { ...d, blocks: replace(d.blocks, bi, nb) };
}

export function addExercise(d: Draft, unit: Unit): Draft {
  return { ...d, blocks: [...d.blocks, blankBlock(unit)] };
}

export function addToSuperset(d: Draft, bi: number, unit: Unit): Draft {
  const b = d.blocks[bi];
  if (!b || b.type !== "superset") return d;
  return {
    ...d,
    blocks: replace(d.blocks, bi, { ...b, exercises: [...b.exercises, blankExercise(unit)] }),
  };
}

function straightFrom(ex: DraftExercise, group: { rounds: string; rest_s: string }): DraftBlock {
  return {
    type: "straight",
    id: shortId(),
    sets: group.rounds,
    rest_s: group.rest_s,
    exercise: ex,
  };
}

export function removeExercise(d: Draft, bi: number, mi: number): Draft {
  const b = d.blocks[bi];
  if (!b) return d;
  if (b.type === "straight" || b.exercises.length <= 1)
    return { ...d, blocks: d.blocks.filter((_, j) => j !== bi) };
  // A group left with one member stays a (invalid) superset with an inline notice.
  return {
    ...d,
    blocks: replace(d.blocks, bi, { ...b, exercises: b.exercises.filter((_, j) => j !== mi) }),
  };
}

/**
 * Move one exercise up (-1) or down (+1).
 *  - a straight block swaps with the neighbouring block (it skips over a whole superset)
 *  - a superset member moves within its group; moving past either end takes it out of the group
 *    (as a straight block with the group's rounds/rest), which may leave a one-member group.
 * Returns the new draft and whether a member left its superset (the UI says so).
 */
export function moveExercise(
  d: Draft,
  bi: number,
  mi: number,
  dir: -1 | 1,
): { draft: Draft; leftGroup: string | null } {
  const b = d.blocks[bi];
  if (!b) return { draft: d, leftGroup: null };
  if (b.type === "straight") {
    const j = bi + dir;
    if (j < 0 || j >= d.blocks.length) return { draft: d, leftGroup: null };
    const blocks = [...d.blocks];
    blocks[bi] = blocks[j] as DraftBlock;
    blocks[j] = b;
    return { draft: { ...d, blocks }, leftGroup: null };
  }
  const nj = mi + dir;
  if (nj >= 0 && nj < b.exercises.length) {
    const ex = [...b.exercises];
    ex[mi] = ex[nj] as DraftExercise;
    ex[nj] = b.exercises[mi] as DraftExercise;
    return {
      draft: { ...d, blocks: replace(d.blocks, bi, { ...b, exercises: ex }) },
      leftGroup: null,
    };
  }
  const letter = supersetLetters(d)[bi] ?? null;
  const out = straightFrom(b.exercises[mi] as DraftExercise, b);
  const rest = { ...b, exercises: b.exercises.filter((_, j) => j !== mi) };
  const blocks = [...d.blocks];
  if (rest.exercises.length === 0) blocks.splice(bi, 1, out);
  else if (dir < 0) blocks.splice(bi, 1, out, rest);
  else blocks.splice(bi, 1, rest, out);
  return { draft: { ...d, blocks }, leftGroup: letter };
}

/**
 * Set type control. Straight → Superset joins the next exercise (or the next superset); on the
 * last card it starts a superset with a new blank member (flow F4.4: "the next exercise defaults
 * to joining A"). Superset → Straight takes the member out of its group.
 */
export function setSetType(
  d: Draft,
  bi: number,
  mi: number,
  type: "straight" | "superset",
  unit: Unit,
): Draft {
  const b = d.blocks[bi];
  if (!b || b.type === type) return d;
  const blocks = [...d.blocks];
  if (b.type === "straight") {
    const next = d.blocks[bi + 1];
    if (next && next.type === "straight") {
      blocks.splice(bi, 2, {
        type: "superset",
        id: b.id,
        rounds: b.sets,
        rest_s: b.rest_s,
        exercises: [b.exercise, next.exercise],
      });
    } else if (next && next.type === "superset") {
      blocks.splice(bi, 2, { ...next, exercises: [b.exercise, ...next.exercises] });
    } else {
      blocks.splice(bi, 1, {
        type: "superset",
        id: b.id,
        rounds: b.sets,
        rest_s: b.rest_s,
        exercises: [b.exercise, blankExercise(unit)],
      });
    }
    return { ...d, blocks };
  }
  const out = straightFrom(b.exercises[mi] as DraftExercise, b);
  const rest = { ...b, exercises: b.exercises.filter((_, j) => j !== mi) };
  if (rest.exercises.length === 0) blocks.splice(bi, 1, out);
  else if (mi === 0) blocks.splice(bi, 1, out, rest);
  else blocks.splice(bi, 1, rest, out);
  return { ...d, blocks };
}

/** A one-member group → straight sets (offered by Save, handoff 4.3). */
export function convertToStraight(d: Draft, bi: number): Draft {
  const b = d.blocks[bi];
  if (!b || b.type !== "superset" || b.exercises.length !== 1) return d;
  return {
    ...d,
    blocks: replace(d.blocks, bi, {
      ...straightFrom(b.exercises[0] as DraftExercise, b),
      id: b.id,
    }),
  };
}

// ----- draft autosave (per user, handoff 4.3 / D12) -----------------------------------------

export interface StoredDraft {
  v: 1;
  userId: string;
  templateId: string | null; // null = new workout
  baseRevision: number | null;
  draft: Draft;
  savedAt: number;
}

export const draftKey = (userId: string) => `dillan.v1.draft.${userId}`;

export function readDraft(userId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    const v = raw ? (JSON.parse(raw) as StoredDraft) : null;
    return v && v.v === 1 && v.userId === userId ? v : null;
  } catch {
    return null;
  }
}

export function writeDraft(d: StoredDraft) {
  try {
    localStorage.setItem(draftKey(d.userId), JSON.stringify(d));
  } catch {
    /* storage full or blocked: the editor still works, just without restore */
  }
}

export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* ignore */
  }
}

/** Field id for a validation path, e.g. "blocks.0.exercise.reps" → "ed-blocks.0.exercise.reps". */
export const fieldId = (path: string) => `ed-${path}`;

/** S05 row text: "4 exercises · 12 sets · includes a superset" and the exercise names. */
export function templateSummary(t: WorkoutTemplate) {
  const names = t.blocks.flatMap((b) =>
    b.type === "straight" ? [b.exercise.name] : b.exercises.map((e) => e.name),
  );
  const sets = buildSteps(t.blocks).length;
  const superset = t.blocks.some((b) => b.type === "superset");
  return {
    meta: `${names.length} exercise${names.length === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"}${superset ? " · includes a superset" : ""}`,
    names: names.join(", "),
  };
}
