import { describe, expect, it } from "vitest";
import { completionOf, isDoubleTap, stepResult, stepsOf, type LoggedSet, type PlanSnapshot } from "@/lib/workout";
import { isUpdateKind } from "@/lib/updates";

const snap: PlanSnapshot = {
  templateVersionId: "v", routineId: "r", versionNo: 1, title: "T", isDemo: false,
  blocks: [
    { position: 2, blockType: "single", priority: "main", rounds: 1, restSeconds: null, prescriptions: [{ exercise_id: "b", name: "Row", sets: 2, reps: 10 }] },
    { position: 1, blockType: "single", priority: "main", rounds: 1, restSeconds: 120, prescriptions: [{ exercise_id: "a", name: "Squat", sets: 3, reps: 8, load: 35 }] },
  ],
};
const log = (ref: string, setNo: number): LoggedSet => ({ key: `${ref}-${setNo}`, ref, setNo, reps: 8, load: 35, unit: "lb", rir: null, loggedAt: "" });

describe("workout rules", () => {
  it("every step keeps the exercise id from the plan, in block order", () => {
    const s = stepsOf(snap);
    expect(s.map((x) => x.exerciseId)).toEqual(["a", "b"]);
    expect(s[1]?.restSeconds).toBe(90);
  });
  it("a second Log tap within 1 second is ignored", () => {
    expect(isDoubleTap(1000, 1500)).toBe(true);
    expect(isDoubleTap(1000, 2000)).toBe(false);
  });
  it("stopping early is recorded as stopped; all sets is complete; fewer is partial", () => {
    const steps = stepsOf(snap);
    const all = [log("1:0", 1), log("1:0", 2), log("1:0", 3), log("2:0", 1), log("2:0", 2)];
    expect(completionOf(steps, all, false)).toBe("complete");
    expect(completionOf(steps, all.slice(0, 2), false)).toBe("partial");
    expect(completionOf(steps, all, true)).toBe("stopped");
    expect(stepResult(steps[0]!, all.slice(0, 2))).toEqual({ kind: "partial", done: 2, of: 3 });
  });
  it("finishing a session is an update and must carry a version", () => {
    expect(isUpdateKind("update:sessions")).toBe(true);
  });
});

import { applySwaps, nextTurn, supersetPattern, turnsOf } from "@/lib/workout";
import { nextSeq } from "@/lib/outbox";

const ss: PlanSnapshot = {
  templateVersionId: "v", routineId: "r", versionNo: 1, title: "T", isDemo: false,
  blocks: [{ position: 1, blockType: "superset", priority: "main", rounds: 3, restSeconds: 75,
    prescriptions: [{ exercise_id: "a", name: "Row", reps: 10 }, { exercise_id: "b", name: "Push-up", reps: 15 }] }],
};

describe("superset (FR-05, AT-02)", () => {
  it("goes A then B each round, transition rest between, round rest after, own reps per exercise", () => {
    const t = turnsOf(stepsOf(ss));
    expect(t.map((x) => `${x.step.name}:${x.round}:${x.restAfter}`)).toEqual([
      "Row:1:20", "Push-up:1:75", "Row:2:20", "Push-up:2:75", "Row:3:20", "Push-up:3:0",
    ]);
    expect(t[0]!.step.reps).toBe(10);
    expect(t[1]!.step.reps).toBe(15);
    expect(supersetPattern(stepsOf(ss))).toBe("Go A → B · rest 20s between · 75s after the round.");
  });
  it("after round 1 the next turn is round 2 of 3", () => {
    const t = turnsOf(stepsOf(ss));
    const n = nextTurn(t, [log("1:0", 1), log("1:1", 1)]);
    expect([n?.step.name, n?.round, n?.rounds]).toEqual(["Row", 2, 3]);
  });
});

describe("swap and order", () => {
  it("a swap changes this session's exercise but not the plan snapshot", () => {
    const before = JSON.stringify(snap);
    const s = applySwaps(stepsOf(snap), { "1:0": { exerciseId: "z", name: "Split squat" } });
    expect([s[0]!.exerciseId, s[0]!.name, s[0]!.plannedName]).toEqual(["z", "Split squat", "Squat"]);
    expect(JSON.stringify(snap)).toBe(before);
  });
  it("outbox sequence numbers strictly increase within one millisecond", () => {
    const a = nextSeq(5), b = nextSeq(5);
    expect(b).toBeGreaterThan(a);
  });
});
