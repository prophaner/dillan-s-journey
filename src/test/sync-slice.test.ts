/**
 * Sync slice: conflict cards, version-in-use guard, storage check. Pure helpers only.
 *
 * brief §13 AT-21 (Two actors edit same plan):
 *   "Stale version rejected/rebased through visible resolution"
 *   Every kind that can 409 and that the user can resolve has a Conflict card (CONFLICT_KINDS);
 *   kinds without one are requeued by Retry instead (see outbox-ordering.test.ts).
 * brief §13 AT-34 (Storage unavailable, quota exceeded, or cleared):
 *   "Honest save/recovery state; no false claim that unsynced data is safe"
 * brief §10.2 (Web application architecture requirements):
 *   "Save stable local IDs, expected server versions, and idempotency keys."
 *   "Browser storage may be unavailable, quota-limited, cleared, or evicted: detect failures,
 *    show honest save state, and encourage synchronization."
 * brief §9.1: "A logged session points to the version actually performed; later template edits do not mutate it."
 */
import { describe, expect, it } from "vitest";
import { CONFLICT_KINDS, compareRows, hasCard, versionInUse } from "@/lib/conflicts";
import { storageVerdict, MIN_FREE_BYTES } from "@/lib/device";
import type { OutboxItem } from "@/lib/outbox";
import { ONBOARDING_KIND } from "@/lib/onboarding";
import { MEASUREMENT_ADD } from "@/lib/measurements";
import { GOAL_LEVEL, ROUTINE_SAVE } from "@/lib/plan";
import { SESSION_FINISH, SESSION_START, SET_LOG, SET_LOG_EDIT } from "@/lib/workout";

const item = (p: Partial<OutboxItem>): OutboxItem => ({ localId: "l", accountId: "a", idempotencyKey: "k", kind: "x", payload: {}, expectedVersion: null, status: "local", attempts: 0, createdAt: 1, ...p });

describe("hasCard: which 409s get a Conflict card (AT-21)", () => {
  it("true for every CONFLICT_KINDS entry, including onboarding:complete", () => {
    expect(CONFLICT_KINDS).toEqual(expect.arrayContaining([GOAL_LEVEL, SET_LOG_EDIT, SESSION_FINISH, ROUTINE_SAVE, ONBOARDING_KIND]));
    expect(CONFLICT_KINDS).toContain("onboarding:complete");
    for (const kind of CONFLICT_KINDS) expect(hasCard(kind)).toBe(true);
  });
  it("false for set_log and measurement:add (Retry requeues these instead)", () => {
    expect(hasCard(SET_LOG)).toBe(false);
    expect(hasCard("set_log")).toBe(false);
    expect(hasCard(MEASUREMENT_ADD)).toBe(false);
    expect(hasCard("measurement:add")).toBe(false);
  });
});

describe("Discard this save is refused while a session uses that version (§9.1)", () => {
  it("unsent session:start on the version blocks the discard", () => {
    expect(versionInUse([item({ kind: SESSION_START, payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(true);
    expect(versionInUse([item({ kind: SESSION_START, status: "failed", payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(true);
  });
  it("a synced start, another version, another kind, or no snapshot does not block", () => {
    expect(versionInUse([item({ kind: SESSION_START, status: "synced", payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(false);
    expect(versionInUse([item({ kind: SESSION_START, payload: { snapshot: { templateVersionId: "v1" } } })], "v2")).toBe(false);
    expect(versionInUse([item({ kind: SET_LOG, payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(false);
    expect(versionInUse([item({ kind: SESSION_START, payload: { id: "s" } })], "v2")).toBe(false);
    expect(versionInUse([], "v2")).toBe(false);
  });
});

describe("Compare shows yours and theirs (AT-21)", () => {
  it("goal level", () => {
    expect(compareRows(GOAL_LEVEL, { level: "improve" }, { level: "maintain" })).toEqual([{ label: "Goal level", yours: "Improve", theirs: "Maintain" }]);
  });
  it("unknown theirs shows a dash, never 0", () => {
    expect(compareRows(SET_LOG_EDIT, { reps: 8, load: 50, rir: 2 }, null).map((r) => r.theirs)).toEqual(["—", "—", "—"]);
  });
  it("onboarding returns exactly one Setup row", () => {
    const rows = compareRows(ONBOARDING_KIND, { id: "p1" }, { onboarding_status: "done" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ label: "Setup", yours: "Done", theirs: "Done" });
    expect(compareRows(ONBOARDING_KIND, { id: "p1" }, null)).toEqual([{ label: "Setup", yours: "Done", theirs: "—" }]);
  });
});

describe("keepYours (conflict-actions.ts) idempotency (§10.2, §9.1)", () => {
  // keepYours for onboarding:complete must reuse the original idempotencyKey (currently generates a new one → duplicate child rows)
  it.todo("keepYours on an onboarding:complete conflict resends with the original idempotencyKey, not a fresh enqueue key");
  it.todo("Settings UnitsControl must refetch the profile row after a sync (stale version → false self-conflict)");
});

describe("storage check (AT-34, §10.2)", () => {
  it("under 1 MB free counts as unavailable", () => {
    expect(storageVerdict({ quota: MIN_FREE_BYTES, usage: 10 })).toBe("unavailable");
    expect(storageVerdict({ quota: 5_000_000, usage: 5_000_000 - MIN_FREE_BYTES + 1 })).toBe("unavailable");
    expect(storageVerdict({ quota: 5_000_000, usage: 5_000_000 - MIN_FREE_BYTES })).toBe("ok");
    expect(storageVerdict({ quota: 50_000_000, usage: 10 })).toBe("ok");
  });
  it("no estimate from the browser is not a verdict; the write probe decides", () => {
    expect(storageVerdict(null)).toBe("ok");
    expect(storageVerdict({})).toBe("ok");
  });
});
