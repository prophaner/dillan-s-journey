import { describe, expect, it } from "vitest";
import { activeTurns, completionOf, nextTurn, reconcileLogs, SET_LOG, SET_LOG_DELETE, SET_LOG_EDIT, stepsOf, turnsOf, type LoggedSet, type PlanSnapshot } from "@/lib/workout";

const snap: PlanSnapshot = {
  templateVersionId: "v", routineId: "r", versionNo: 1, title: "T", isDemo: true,
  blocks: [
    { position: 1, blockType: "single", priority: "main", rounds: 3, restSeconds: 90, prescriptions: [{ exercise_id: "a", name: "A", sets: 3, reps: 8 }] },
    { position: 2, blockType: "single", priority: "main", rounds: 2, restSeconds: 60, prescriptions: [{ exercise_id: "b", name: "B", sets: 2, reps: 10 }] },
  ],
};
const steps = stepsOf(snap);
const log = (ref: string, setNo: number, key = `${ref}#${setNo}-key`): LoggedSet => ({ key, ref, setNo, reps: 8, load: null, unit: "lb", rir: null, loggedAt: "2026-10-16T00:00:00Z" });

describe("S11 Stop this exercise", () => {
  it("skips the rest of the exercise and keeps done sets", () => {
    const logs = [log("1:0", 1)];
    const t = nextTurn(activeTurns(turnsOf(steps), ["1:0"]), logs);
    expect(t?.step.ref).toBe("2:0");
    expect(logs).toHaveLength(1);
  });
  it("a stopped exercise makes the session partial, not complete", () => {
    expect(completionOf(steps, [log("1:0", 1), log("2:0", 1), log("2:0", 2)], false)).toBe("partial");
  });
});

describe("draft reconcile", () => {
  const item = (kind: string, idempotencyKey: string, payload: unknown, expectedVersion: number | null = null) => ({ kind, idempotencyKey, payload, expectedVersion });
  it("a set queued before a failed draft save appears exactly once", () => {
    const items = [item(SET_LOG, "k1", { sessionId: "s", ref: "1:0", setNo: 1, reps: 8, load: 30, unit: "lb", rir: null, loggedAt: "x" })];
    const once = reconcileLogs([], items, "s");
    expect(once.map((l) => l.key)).toEqual(["k1"]);
    expect(reconcileLogs(once, items, "s")).toBe(once);
  });
  it("ignores other sessions and drops undone sets", () => {
    const items = [
      item(SET_LOG, "k2", { sessionId: "other", ref: "1:0", setNo: 1 }),
      item(SET_LOG_DELETE, "d1", { sessionId: "s", setKey: "kA" }),
    ];
    expect(reconcileLogs([log("1:0", 1, "kA")], items, "s")).toEqual([]);
  });
  it("applies a queued edit and bumps the version", () => {
    const items = [item(SET_LOG_EDIT, "e1", { sessionId: "s", setKey: "kA", reps: 5, load: 40, rir: 1 }, 1)];
    const out = reconcileLogs([log("1:0", 1, "kA")], items, "s");
    expect(out[0]).toMatchObject({ reps: 5, load: 40, version: 2 });
  });
});
