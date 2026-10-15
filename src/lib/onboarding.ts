/**
 * S12 Onboarding — answers, defaults and the payload sent through the outbox.
 * null / empty always means "Not yet known" (FR-01); it is never turned into 0.
 */
export const ONBOARDING_KIND = "onboarding:complete";
export const STEP_COUNT = 6; // question steps; step 7 is the summary

export interface EquipmentChoice {
  key: string;
  type: string;
  label: string;
  detail: string;
  quantity: number;
}

export const EQUIPMENT_PRESETS: EquipmentChoice[] = [
  { key: "dumbbells", type: "adjustable_dumbbells", label: "Adjustable dumbbells", detail: "5–52.5 lb · 2.5 steps", quantity: 2 },
  { key: "pullup", type: "pullup_bar", label: "Pull-up bar", detail: "Doorway", quantity: 1 },
  { key: "bench", type: "flat_bench", label: "Flat bench", detail: "Add incline?", quantity: 1 },
  { key: "bands", type: "bands", label: "Bands", detail: "Light, medium", quantity: 2 },
  { key: "kettlebell", type: "kettlebell", label: "Kettlebell", detail: "One bell", quantity: 1 },
  { key: "bodyweight", type: "bodyweight", label: "Just my body", detail: "Floor space", quantity: 1 },
];

export type Side = "left" | "right" | "both";
export const LIMITATION_AREAS = ["Shoulder", "Elbow", "Wrist", "Back", "Hip", "Knee", "Ankle", "Neck"] as const;
export const SIDED_AREAS = new Set(["Shoulder", "Elbow", "Wrist", "Hip", "Knee", "Ankle"]);

export interface LimitationChoice {
  area: string;
  side: Side | null;
}

export type LimitationsAnswer = "listed" | "none_known" | "prefer_not" | null;

export interface RoutineRow {
  name: string;
  sets: string;
  reps: string;
  load: string;
}

export interface OnboardingAnswers {
  goalWords: string;
  goals: string[];
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  equipment: EquipmentChoice[];
  equipmentUnsure: boolean;
  limitations: LimitationChoice[];
  limitationsAnswer: LimitationsAnswer;
  routineMode: "own" | "demo" | null;
  routineName: string;
  routineRows: RoutineRow[];
}

export const emptyAnswers = (): OnboardingAnswers => ({
  goalWords: "",
  goals: [],
  daysPerWeek: null,
  sessionMinutes: null,
  equipment: [],
  equipmentUnsure: false,
  limitations: [],
  limitationsAnswer: null,
  routineMode: null,
  routineName: "",
  routineRows: [{ name: "", sets: "", reps: "", load: "" }],
});

/** Whole numbers only; blank or invalid stays unknown (null), never 0. */
export function parseCount(v: string): number | null {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export function parseLoad(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export interface RoutinePayloadRow {
  name: string;
  sets: number | null;
  reps: number | null;
  load: number | null;
  unit: "lb";
}

export interface OnboardingPayload {
  goals: { title: string; userWords: string }[];
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  equipment: { type: string; label: string; detail: string; quantity: number }[];
  limitationsAnswer: LimitationsAnswer;
  limitations: { category: string; location: string; side: Side | "none" }[];
  routine: { title: string; rows: RoutinePayloadRow[] } | null;
  keepDemo: boolean;
}

export function routineRowsFilled(rows: RoutineRow[]) {
  return rows.filter((r) => r.name.trim().length > 0);
}

export function buildOnboardingPayload(a: OnboardingAnswers): OnboardingPayload {
  const words = a.goalWords.trim();
  const goals = a.goals.map((g) => g.trim()).filter(Boolean).slice(0, 3);
  const rows = routineRowsFilled(a.routineRows);
  const routine =
    a.routineMode === "own" && rows.length > 0
      ? {
          title: a.routineName.trim() || "My routine",
          rows: rows.map((r) => ({
            name: r.name.trim(),
            sets: parseCount(r.sets),
            reps: parseCount(r.reps),
            load: parseLoad(r.load),
            unit: "lb" as const,
          })),
        }
      : null;
  return {
    goals: goals.map((title) => ({ title, userWords: words })),
    daysPerWeek: a.daysPerWeek,
    sessionMinutes: a.sessionMinutes,
    equipment: a.equipmentUnsure
      ? []
      : a.equipment.map(({ type, label, detail, quantity }) => ({ type, label, detail, quantity })),
    limitationsAnswer: a.limitationsAnswer,
    limitations:
      a.limitationsAnswer === "listed"
        ? a.limitations.map((l) => ({ category: "joint", location: l.area, side: l.side ?? "none" }))
        : [],
    routine,
    keepDemo: routine === null,
  };
}

/** Summary: what Dillan knows and what it doesn't yet. */
export function summarize(p: OnboardingPayload) {
  return [
    { label: "Goals", value: p.goals.length ? p.goals.map((g) => g.title).join(" · ") : null },
    { label: "Days per week", value: p.daysPerWeek === null ? null : `${p.daysPerWeek}` },
    { label: "Typical session", value: p.sessionMinutes === null ? null : `${p.sessionMinutes} min` },
    { label: "Equipment", value: p.equipment.length ? p.equipment.map((e) => e.label).join(", ") : null },
    {
      label: "Things to work around",
      value:
        p.limitationsAnswer === "none_known"
          ? "Nothing you know of"
          : p.limitationsAnswer === "prefer_not"
            ? "You'd rather not say"
            : p.limitationsAnswer === "listed" && p.limitations.length
              ? p.limitations.map((l) => (l.side === "none" ? l.location : `${l.location} (${l.side})`)).join(", ")
              : null,
    },
    { label: "Routine", value: p.routine ? `${p.routine.title} · ${p.routine.rows.length} exercises` : null },
  ];
}

/** Server-side shape check. Throws on anything unexpected. */
export function validateOnboardingPayload(x: unknown): OnboardingPayload {
  const p = x as OnboardingPayload;
  const intOrNull = (v: unknown, lo: number, hi: number) =>
    v === null || (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi);
  const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  if (!p || typeof p !== "object") throw new Error("400 invalid onboarding payload");
  const ok =
    Array.isArray(p.goals) && p.goals.length <= 3 && p.goals.every((g) => str(g.title, 200) && g.title.trim() && str(g.userWords, 1000)) &&
    intOrNull(p.daysPerWeek, 1, 7) &&
    intOrNull(p.sessionMinutes, 10, 180) &&
    Array.isArray(p.equipment) && p.equipment.length <= 30 &&
    p.equipment.every((e) => str(e.type, 60) && str(e.label, 80) && str(e.detail, 120) && Number.isInteger(e.quantity) && e.quantity >= 0) &&
    [null, "listed", "none_known", "prefer_not"].includes(p.limitationsAnswer) &&
    Array.isArray(p.limitations) && p.limitations.length <= 20 &&
    p.limitations.every((l) => str(l.location, 40) && ["left", "right", "both", "none"].includes(l.side)) &&
    typeof p.keepDemo === "boolean" &&
    (p.routine === null ||
      (str(p.routine.title, 80) && Array.isArray(p.routine.rows) && p.routine.rows.length >= 1 && p.routine.rows.length <= 30 &&
        p.routine.rows.every((r) => str(r.name, 80) && r.name.trim() && intOrNull(r.sets, 1, 20) && intOrNull(r.reps, 1, 200) &&
          (r.load === null || (typeof r.load === "number" && r.load >= 0 && r.load <= 2000)))));
  if (!ok) throw new Error("400 invalid onboarding payload");
  return p;
}

export const onboardedFlag = (userId: string) => `dillan:onboarded:${userId}`;
