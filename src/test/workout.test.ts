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
