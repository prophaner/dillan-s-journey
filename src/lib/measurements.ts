/**
 * S08 Progress + measurement entry (FR-10). Pure helpers: shared by the screen, the server and tests.
 * The original entry (value + unit as typed) is stored; units convert in display only (AT-22).
 */
export const MEASUREMENT_ADD = "measurement:add";

export type MeasureType = "weight" | "height" | "waist" | "hips" | "arm" | "thigh" | "other";
export type Side = "left" | "right" | "both" | "none";
export type Unit = "lb" | "kg" | "in" | "cm";

export const MEASURE_TYPES: { id: MeasureType; label: string; kind: "mass" | "length"; sided: boolean }[] = [
  { id: "weight", label: "Weight", kind: "mass", sided: false },
  { id: "height", label: "Height", kind: "length", sided: false },
  { id: "waist", label: "Waist", kind: "length", sided: false },
  { id: "hips", label: "Hips", kind: "length", sided: false },
  { id: "arm", label: "Arm / biceps", kind: "length", sided: true },
  { id: "thigh", label: "Thigh", kind: "length", sided: true },
  { id: "other", label: "Other", kind: "length", sided: false },
];
export const METHODS = ["Scale", "Tape measure", "Other"] as const;

export const typeInfo = (t: string) => MEASURE_TYPES.find((m) => m.id === t);
export const unitsFor = (t: string): Unit[] => (typeInfo(t)?.kind === "mass" ? ["lb", "kg"] : ["in", "cm"]);

export interface MeasurementInput {
  id: string;
  type: MeasureType;
  site: string | null;
  side: Side;
  enteredValue: string;
  unit: Unit;
  method: string | null;
  conditions: string | null;
  observedAt: string;
}

/** Parse what was typed ("32,5" ok). Null when it isn't a usable positive number. */
export function parseValue(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 2000 ? n : null;
}

export function validateMeasurement(raw: unknown): MeasurementInput & { value: number } {
  const p = raw as Partial<MeasurementInput> | null;
  if (!p || typeof p.id !== "string" || !/^[0-9a-f-]{36}$/i.test(p.id)) throw new Error("400 bad id");
  const info = typeInfo(String(p.type));
  if (!info) throw new Error("400 bad type");
  if (!unitsFor(info.id).includes(p.unit as Unit)) throw new Error("400 bad unit");
  const value = parseValue(String(p.enteredValue ?? ""));
  if (value === null) throw new Error("400 bad value");
  const side: Side = info.sided ? (p.side === "left" || p.side === "right" || p.side === "both" ? p.side : "none") : "none";
  if (info.sided && side === "none") throw new Error("400 side required");
  if (!p.observedAt || Number.isNaN(Date.parse(p.observedAt))) throw new Error("400 bad date");
  // A few minutes of clock drift is allowed; anything later is a future date.
  if (Date.parse(p.observedAt) > Date.now() + 5 * 60000) throw new Error("400 bad date: in the future");
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  return {
    id: p.id, type: info.id, site: s(p.site, 60), side, enteredValue: String(p.enteredValue).trim(),
    unit: p.unit as Unit, method: s(p.method, 40), conditions: s(p.conditions, 120), observedAt: p.observedAt, value,
  };
}

/** Display-only conversion. Never written back. Null for a pair it doesn't know. */
export function convert(value: number, from: string, to: string): number | null {
  if (from === to) return value;
  if (from === "kg" && to === "lb") return value * 2.2046226218;
  if (from === "lb" && to === "kg") return value / 2.2046226218;
  if (from === "cm" && to === "in") return value / 2.54;
  if (from === "in" && to === "cm") return value * 2.54;
  return null;
}
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** BMI: a derived number from weight and height, not a judgment of fitness. Null if either is missing. */
export function bmi(weight: { value: number; unit: string } | null, height: { value: number; unit: string } | null): number | null {
  if (!weight || !height) return null;
  const kg = convert(weight.value, weight.unit, "kg");
  const cm = convert(height.value, height.unit, "cm");
  if (kg === null || cm === null) return null;
  const m = cm / 100;
  if (!(kg > 0 && m > 0)) return null;
  return round1(kg / (m * m));
}

export interface Row { id: string; type: string; side: string | null; site: string | null; value: number; unit: string; observed_at: string; method?: string | null }

/** Series key: left and right are never merged (FR-10 bilateral). */
export const seriesKey = (r: Pick<Row, "type" | "side" | "site">) =>
  `${r.type}|${r.site ?? ""}|${r.side && r.side !== "none" ? r.side : ""}`;

export function groupSeries(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of [...rows].sort((a, b) => a.observed_at.localeCompare(b.observed_at))) {
    const k = seriesKey(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

const DAY = 86400000;
/** Gaps longer than `minDays` between observations, so a chart can label them instead of hiding them. */
export function gaps(dates: string[], minDays = 21): { from: string; to: string; days: number }[] {
  const out: { from: string; to: string; days: number }[] = [];
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((Date.parse(dates[i]!) - Date.parse(dates[i - 1]!)) / DAY);
    if (days > minDays) out.push({ from: dates[i - 1]!, to: dates[i]!, days });
  }
  return out;
}

export type WeekPip = "done" | "short" | "partial" | "planned" | "empty";
export interface WeekSessionRow { local_date: string; completion: string; shortened: boolean }

/** Monday (YYYY-MM-DD) of the week containing a local date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Steady weeks from real sessions. A week is steady when finished sessions reach the weekly target.
 * Target unknown → steady count is null (shown as "Not yet known"), pips still show what happened.
 * The current week is never counted against you.
 */
export function steadyWeeks(sessions: WeekSessionRow[], today: string, target: number | null, weeks = 8, since?: string | null) {
  const thisMon = mondayOf(today);
  const cols: { monday: string; current: boolean; pips: WeekPip[] }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const d = new Date(`${thisMon}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * w);
    const monday = d.toISOString().slice(0, 10);
    const inWeek = sessions.filter((s) => s.completion !== "in_progress" && mondayOf(s.local_date) === monday);
    const pips: WeekPip[] = inWeek.map((s) =>
      s.completion === "complete" && !s.shortened ? "done" : s.shortened ? "short" : "partial");
    const slots = Math.max(target ?? 0, pips.length);
    while (pips.length < slots) pips.push(w === 0 ? "planned" : "empty");
    cols.push({ monday, current: w === 0, pips });
  }
  // `since` = date of the first session ever: weeks before it don't count (null = none yet → unknown).
  const firstMon = since ? mondayOf(since) : null;
  const past = cols.filter((c) => !c.current && (since === undefined || (firstMon !== null && c.monday >= firstMon)));
  if (since === null) return { cols, steady: null, of: 0 };
  const steady = target ? past.filter((c) => c.pips.filter((p) => p !== "empty" && p !== "planned").length >= target).length : null;
  return { cols, steady, of: past.length };
}
