// Template validation. Twin of public.v1_template_errors() in 0006_v1_core.sql: same paths,
// same codes, same bounds (handoff 4.3). Messages are UI copy.

export const LIMITS = {
  nameMax: 60,
  setsMin: 1,
  setsMax: 20,
  repsMin: 1,
  repsMax: 200,
  weightMin: 0,
  weightMax: 1000,
  restMin: 0,
  restMax: 600,
  restDefault: 60,
  instructionsMax: 240,
  supersetMin: 2,
  supersetMax: 6,
  exercisesMax: 30,
  idMax: 64,
} as const;

export type ValidationCode =
  | "required"
  | "too_long"
  | "too_many"
  | "range"
  | "invalid"
  | "superset_too_small"
  | "superset_too_large";

export interface FieldError {
  path: string; // e.g. "name", "blocks.0.sets", "blocks.1.exercises.0.reps"
  code: ValidationCode;
  message: string;
}

const MESSAGES: Record<string, string> = {
  "name.required": "Give this workout a name.",
  "name.too_long": "Use 60 characters or fewer.",
  "blocks.required": "Add at least one exercise.",
  "blocks.too_many": "Use 30 exercises or fewer.",
  "exercise.name.required": "Exercise needs a name.",
  "exercise.name.too_long": "Use 60 characters or fewer.",
  sets: "Whole number, 1 to 20.",
  rounds: "Whole number, 1 to 20.",
  reps: "Whole number, 1 to 200.",
  weight: "Leave blank for bodyweight, or enter 0 to 1000.",
  "load_basis.required": "Choose Per implement or Total load.",
  rest_s: "Seconds, 0 to 600.",
  "instructions.too_long": "Use 240 characters or fewer.",
  superset_too_small: "A superset needs at least two exercises next to each other.",
  superset_too_large: "A superset can have up to 6 exercises.",
  invalid: "Choose one of the options.",
};

function messageFor(path: string, code: ValidationCode): string {
  const last = path.split(".").pop() ?? path;
  if (path === "name") return MESSAGES[`name.${code}`] ?? MESSAGES["invalid"]!;
  if (path === "blocks") return MESSAGES[`blocks.${code}`] ?? MESSAGES["invalid"]!;
  if (code === "superset_too_small" || code === "superset_too_large") return MESSAGES[code]!;
  if (last === "name") return MESSAGES[`exercise.name.${code}`] ?? MESSAGES["invalid"]!;
  if (code === "range") return MESSAGES[last] ?? MESSAGES["invalid"]!;
  return MESSAGES[`${last}.${code}`] ?? MESSAGES["invalid"]!;
}

/** Same characters as SQL btrim(t, E' \t\r\n'). */
export function trimSql(s: string): string {
  return s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Length in code points, like SQL char_length. */
export function charLength(s: string): number {
  return [...s].length;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
export const isNum = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isId = (v: unknown) =>
  typeof v === "string" && charLength(v) >= 1 && charLength(v) <= LIMITS.idMax;

type Raw = { path: string; code: ValidationCode };

function exerciseErrors(ex: unknown, p: string): Raw[] {
  if (!isObj(ex)) return [{ path: p, code: "invalid" }];
  const out: Raw[] = [];
  if (!isId(ex["id"])) out.push({ path: `${p}.id`, code: "invalid" });
  const name = ex["name"];
  if (typeof name !== "string" || charLength(trimSql(name)) === 0)
    out.push({ path: `${p}.name`, code: "required" });
  else if (charLength(trimSql(name)) > LIMITS.nameMax)
    out.push({ path: `${p}.name`, code: "too_long" });
  if (!isInt(ex["reps"], LIMITS.repsMin, LIMITS.repsMax))
    out.push({ path: `${p}.reps`, code: "range" });
  if (ex["rep_mode"] !== "total" && ex["rep_mode"] !== "per_side")
    out.push({ path: `${p}.rep_mode`, code: "invalid" });
  if (ex["unit"] !== "lb" && ex["unit"] !== "kg") out.push({ path: `${p}.unit`, code: "invalid" });
  const w = ex["weight"];
  if ("weight" in ex && w !== null && !isNum(w, LIMITS.weightMin, LIMITS.weightMax))
    out.push({ path: `${p}.weight`, code: "range" });
  const lb = ex["load_basis"];
  if ("load_basis" in ex && lb !== null && lb !== "total_external" && lb !== "per_implement")
    out.push({ path: `${p}.load_basis`, code: "invalid" });
  else if (isNum(w, LIMITS.weightMin, LIMITS.weightMax) && (lb === null || lb === undefined))
    out.push({ path: `${p}.load_basis`, code: "required" });
  const ins = ex["instructions"];
  if (typeof ins !== "string") out.push({ path: `${p}.instructions`, code: "invalid" });
  else if (charLength(ins) > LIMITS.instructionsMax)
    out.push({ path: `${p}.instructions`, code: "too_long" });
  return out;
}

/** Raw (path, code) list, in the same order as the SQL function. */
export function templateErrorCodes(name: unknown, blocks: unknown): Raw[] {
  const out: Raw[] = [];
  if (typeof name !== "string" || charLength(trimSql(name)) === 0)
    out.push({ path: "name", code: "required" });
  else if (charLength(trimSql(name)) > LIMITS.nameMax) out.push({ path: "name", code: "too_long" });
  if (!Array.isArray(blocks) || blocks.length === 0) {
    out.push({ path: "blocks", code: "required" });
    return out;
  }
  let total = 0;
  blocks.forEach((b: unknown, bi) => {
    const p = `blocks.${bi}`;
    if (!isObj(b) || (b["type"] !== "straight" && b["type"] !== "superset")) {
      out.push({ path: `${p}.type`, code: "invalid" });
      return;
    }
    if (!isId(b["id"])) out.push({ path: `${p}.id`, code: "invalid" });
    if (!isInt(b["rest_s"], LIMITS.restMin, LIMITS.restMax))
      out.push({ path: `${p}.rest_s`, code: "range" });
    if (b["type"] === "straight") {
      total += 1;
      if (!isInt(b["sets"], LIMITS.setsMin, LIMITS.setsMax))
        out.push({ path: `${p}.sets`, code: "range" });
      out.push(...exerciseErrors(b["exercise"], `${p}.exercise`));
    } else {
      if (!isInt(b["rounds"], LIMITS.setsMin, LIMITS.setsMax))
        out.push({ path: `${p}.rounds`, code: "range" });
      const members = b["exercises"];
      if (!Array.isArray(members) || members.length < LIMITS.supersetMin)
        out.push({ path: `${p}.exercises`, code: "superset_too_small" });
      else if (members.length > LIMITS.supersetMax)
        out.push({ path: `${p}.exercises`, code: "superset_too_large" });
      if (Array.isArray(members)) {
        total += members.length;
        members.forEach((m: unknown, mi) => out.push(...exerciseErrors(m, `${p}.exercises.${mi}`)));
      }
    }
  });
  if (total > LIMITS.exercisesMax) out.push({ path: "blocks", code: "too_many" });
  return out;
}

/** Field-level errors with UI messages. Empty array = valid. */
export function validateTemplate(t: { name: unknown; blocks: unknown }): FieldError[] {
  return templateErrorCodes(t.name, t.blocks).map((e) => ({
    ...e,
    message: messageFor(e.path, e.code),
  }));
}

/** Errors keyed by path (first error per field), for forms. */
export function errorsByPath(errors: FieldError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) if (!(e.path in out)) out[e.path] = e.message;
  return out;
}
