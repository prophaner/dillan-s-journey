/**
 * Profile & Settings rules (FR-01, FR-04, FR-09, FR-17) and the states-review fixes.
 * Owner's words: every UPDATE sends the version it read; units are display only and default to lb/in;
 * a resent onboarding keeps its original idempotency key; experience is new / returning / experienced.
 */
import { describe, expect, it, vi } from "vitest";

const mem = vi.hoisted(() => new Map<string, Map<string, Record<string, unknown>>>());
vi.mock("idb", () => {
  const store = (n: string) => { let s = mem.get(n); if (!s) { s = new Map(); mem.set(n, s); } return s; };
  const keyOf = (n: string, r: Record<string, unknown>) => String(n === "outbox" ? r["localId"] : r["key"]);
  return {
    openDB: async () => ({
      put: async (n: string, r: Record<string, unknown>) => { store(n).set(keyOf(n, r), r); },
      get: async (n: string, k: string) => store(n).get(k),
      delete: async (n: string, k: string) => { store(n).delete(k); },
      getAllKeys: async (n: string) => [...store(n).keys()],
      getAllFromIndex: async (n: string, _i: string, v: string) => [...store(n).values()].filter((r) => r["accountId"] === v),
    }),
  };
});

import { enqueue, listItems, rewriteUnsent } from "@/lib/outbox";
import { DEFAULT_UNITS, joinContext, localUnits, splitContext, unitsOf, validateRowUpdate, UPDATE_PROFILE, UPDATE_EQUIPMENT } from "@/lib/profile";
import { localLabel } from "@/lib/device";

const ID = "11111111-1111-4111-8111-111111111111";

describe("profile updates", () => {
  it("updates must carry the version they read", async () => {
    await expect(enqueue("a", UPDATE_EQUIPMENT, { id: ID, patch: { available: false } }, null)).rejects.toThrow(/version/);
  });
  it("rejects fields the app may not change", () => {
    expect(() => validateRowUpdate("equipment_items", { id: ID, patch: { owner_id: ID } })).toThrow(/400/);
    expect(() => validateRowUpdate("profiles", { id: ID, patch: { onboarding_status: "done" } })).toThrow(/400/);
  });
  it("experience accepts only new / returning / experienced", () => {
    expect(validateRowUpdate("profiles", { id: ID, patch: { experience: "returning" } }).patch["experience"]).toBe("returning");
    expect(() => validateRowUpdate("profiles", { id: ID, patch: { experience: "expert" } })).toThrow(/400/);
  });
  it("limitation status is one of accommodated / avoided / pending / resolved", () => {
    expect(() => validateRowUpdate("limitations", { id: ID, patch: { status: "resolved" } })).not.toThrow();
    expect(() => validateRowUpdate("limitations", { id: ID, patch: { status: "cured" } })).toThrow(/400/);
  });
  it("week start is 0–6 and training days are distinct days", () => {
    expect(() => validateRowUpdate("profiles", { id: ID, patch: { week_start: 7 } })).toThrow(/400/);
    expect(() => validateRowUpdate("profiles", { id: ID, patch: { training_days: [1, 1] } })).toThrow(/400/);
  });
});

describe("units", () => {
  it("default to pounds and inches", () => {
    expect(unitsOf(null)).toEqual({ weight: "lb", length: "in" });
    expect(DEFAULT_UNITS).toEqual({ weight: "lb", length: "in" });
  });
  it("read preferences.units first", () => {
    expect(unitsOf({ preferences: { units: { weight: "kg", length: "cm" } }, weight_unit: "lb", length_unit: "in" })).toEqual({ weight: "kg", length: "cm" });
  });
  it("an unsent units change on this device wins", () => {
    const item = { kind: UPDATE_PROFILE, status: "local", payload: { id: ID, patch: { units: { weight: "kg", length: "in" } } } };
    expect(localUnits([item as never], DEFAULT_UNITS).weight).toBe("kg");
  });
});

describe("limitation note", () => {
  it("edits only the note, keeping the session and date", () => {
    const ctx = `Session ${ID} · 2026-10-16 (Europe/Rome) · twinge`;
    const s = splitContext(ctx);
    expect(s.note).toBe("twinge");
    expect(joinContext(s.prefix, "better now")).toBe(`Session ${ID} · 2026-10-16 (Europe/Rome) · better now`);
  });
});

describe("outbox", () => {
  it("a resend can keep its original idempotency key", async () => {
    const it1 = await enqueue("k", "onboarding:complete", {}, 3, { idempotencyKey: "orig-key-123" });
    expect(it1.idempotencyKey).toBe("orig-key-123");
  });
  it("rewriteUnsent keeps order and never touches synced items", async () => {
    const a = await enqueue("r", "x", { n: 1 });
    await rewriteUnsent("r", (i) => ({ ...i, payload: { n: 2 } }));
    const [b] = await listItems("r");
    expect(b!.payload).toEqual({ n: 2 });
    expect(b!.seq).toBe(a.seq);
  });
});

describe("storage unavailable (AT-34)", () => {
  it("local items read 'Kept in this tab only'", () => {
    expect(localLabel("unavailable")).toBe("Kept in this tab only");
    expect(localLabel("ok")).toBe("Saved on this device");
  });
});
