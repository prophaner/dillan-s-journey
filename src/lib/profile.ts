/**
 * Profile & Settings (FR-01, FR-04, FR-09, FR-17). Pure rules shared by the page, the
 * outbox and the server. null always means "Not yet known", never 0.
 */
import type { OutboxItem } from "./outbox";

export const UPDATE_PROFILE = "update:profiles";
export const UPDATE_EQUIPMENT = "update:equipment_items";
export const UPDATE_LIMITATION = "update:limitations";
export const INSERT_EQUIPMENT = "insert:equipment_items";
export const PROFILE_UPDATE_KINDS = [UPDATE_PROFILE, UPDATE_EQUIPMENT, UPDATE_LIMITATION] as const;
export type ProfileTable = "profiles" | "equipment_items" | "limitations";
export const tableOfUpdate = (kind: string) => kind.slice(7) as ProfileTable;

export interface RowUpdatePayload { id: string; patch: Record<string, unknown> }

export type WeightUnit = "lb" | "kg";
export type LengthUnit = "in" | "cm";
export interface Units { weight: WeightUnit; length: LengthUnit }
export const DEFAULT_UNITS: Units = { weight: "lb", length: "in" };

export const EXPERIENCE = ["new", "returning", "experienced"] as const;
export type Experience = (typeof EXPERIENCE)[number];
export const EXPERIENCE_LABEL: Record<Experience, string> = { new: "New to lifting", returning: "Coming back", experienced: "Experienced" };

export const LIMITATION_STATUSES = ["accommodated", "avoided", "pending", "resolved"] as const;
export type LimitationStatus = (typeof LIMITATION_STATUSES)[number] | "active" | "archived";
export const LIMITATION_LABEL: Record<string, string> = {
  active: "Noted", accommodated: "Accommodated", avoided: "Avoided", pending: "Pending", resolved: "Resolved", archived: "Removed",
};

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Day indices 0–6 starting from the chosen first day (default Monday). */
export const weekOrder = (start: number | null) => Array.from({ length: 7 }, (_, i) => ((start ?? 1) + i) % 7);

/** Units from profiles.preferences.units, falling back to the older columns, then lb/in. */
export function unitsOf(p: { preferences?: unknown; weight_unit?: string | null; length_unit?: string | null } | null | undefined): Units {
  const u = (p?.preferences as { units?: Partial<Units> } | null | undefined)?.units;
  return {
    weight: u?.weight === "kg" || u?.weight === "lb" ? u.weight : p?.weight_unit === "kg" ? "kg" : "lb",
    length: u?.length === "cm" || u?.length === "in" ? u.length : p?.length_unit === "cm" ? "cm" : "in",
  };
}

/** An unsent units change on this device wins, so the screen follows what you just chose. */
export function localUnits(items: OutboxItem[], server: Units): Units {
  const last = items.filter((i) => i.kind === UPDATE_PROFILE && i.status !== "synced")
    .map((i) => (i.payload as RowUpdatePayload).patch.units as Units | undefined).filter(Boolean).at(-1);
  return last ?? server;
}

/** Server rows with this device's unsent changes laid over them (local-first display). */
export function overlay<T extends { id: string }>(rows: T[], items: OutboxItem[], kind: string, insertKind?: string): (T & { pending?: boolean })[] {
  const out = rows.map((r) => ({ ...r })) as (T & { pending?: boolean })[];
  for (const i of items) {
    if (i.status === "synced") continue;
    if (insertKind && i.kind === insertKind) {
      const row = i.payload as T;
      if (!out.some((r) => r.id === row.id)) out.push({ ...row, pending: true });
    }
    if (i.kind === kind) {
      const u = i.payload as RowUpdatePayload;
      const r = out.find((x) => x.id === u.id);
      if (r) Object.assign(r, u.patch, { pending: true });
    }
  }
  return out;
}

/** "Session <id> · 2026-10-16 (Europe/Rome) · note" → the note part only. */
const CTX = /^(Session [0-9a-f-]{36} · \d{4}-\d{2}-\d{2}(?: \([^)]*\))?)(?: · (.*))?$/s;
export function splitContext(ctx: string | null): { prefix: string | null; note: string } {
  if (!ctx) return { prefix: null, note: "" };
  const m = CTX.exec(ctx);
  return m ? { prefix: m[1]!, note: m[2] ?? "" } : { prefix: null, note: ctx };
}
export const joinContext = (prefix: string | null, note: string) =>
  prefix ? (note ? `${prefix} · ${note}` : prefix) : note || null;

const isInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const nullOr = (v: unknown, ok: (x: unknown) => boolean) => v === null || ok(v);
const str = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;

const RULES: Record<ProfileTable, Record<string, (v: unknown) => boolean>> = {
  profiles: {
    days_per_week: (v) => nullOr(v, (x) => isInt(x, 1, 7)),
    session_minutes: (v) => nullOr(v, (x) => isInt(x, 10, 180)),
    training_days: (v) => nullOr(v, (x) => Array.isArray(x) && x.length <= 7 && new Set(x).size === x.length && x.every((d) => isInt(d, 0, 6))),
    week_start: (v) => nullOr(v, (x) => isInt(x, 0, 6)),
    experience: (v) => v === null || (EXPERIENCE as readonly unknown[]).includes(v),
    timezone: (v) => typeof v === "string" && v.length > 0 && v.length <= 64,
    units: (v) => { const u = v as Units | null; return !!u && (u.weight === "lb" || u.weight === "kg") && (u.length === "in" || u.length === "cm"); },
  },
  equipment_items: {
    available: (v) => typeof v === "boolean",
    archived: (v) => typeof v === "boolean",
  },
  limitations: {
    status: (v) => (LIMITATION_STATUSES as readonly unknown[]).includes(v),
    note: (v) => str(280)(v),
    archived: (v) => typeof v === "boolean",
  },
};

/** Throws "400 …" unless every field is one the app may change, with a valid value. */
export function validateRowUpdate(table: ProfileTable, raw: unknown): RowUpdatePayload {
  const p = raw as RowUpdatePayload | null;
  if (!p || typeof p.id !== "string" || !/^[0-9a-f-]{36}$/i.test(p.id) || !p.patch || typeof p.patch !== "object") throw new Error("400 bad update");
  const keys = Object.keys(p.patch);
  if (!keys.length) throw new Error("400 empty update");
  for (const k of keys) {
    const rule = RULES[table][k];
    if (!rule || !rule(p.patch[k])) throw new Error(`400 bad field ${k}`);
  }
  if (table === "profiles" && "timezone" in p.patch) {
    try { new Intl.DateTimeFormat("en", { timeZone: p.patch.timezone as string }); } catch { throw new Error("400 bad timezone"); }
  }
  return p;
}

export interface EquipmentAdd { id: string; type: string; label: string; detail: string | null; quantity: number; available: boolean }
export function validateEquipmentAdd(raw: unknown): EquipmentAdd {
  const p = raw as EquipmentAdd | null;
  if (!p || typeof p.id !== "string" || !/^[0-9a-f-]{36}$/i.test(p.id)) throw new Error("400 bad equipment");
  if (typeof p.label !== "string" || !p.label.trim() || p.label.length > 80) throw new Error("400 name required");
  if (!(p.detail === null || str(120)(p.detail)) || !isInt(p.quantity, 1, 99) || typeof p.type !== "string" || p.type.length > 60) throw new Error("400 bad equipment");
  return { ...p, label: p.label.trim(), detail: p.detail?.trim() || null, available: p.available !== false };
}

/** Merge a new change into a still-unsent change for the same row, so versions never stack up. */
export function mergePatch(a: Record<string, unknown>, b: Record<string, unknown>) {
  return { ...a, ...b };
}
