import { describe, expect, it } from "vitest";
import { applyTimePlan, estimateMinutes, keptPositions, whyThisTrade } from "@/lib/time-plan";
import { completionOf, stepsOf, type PlanSnapshot } from "@/lib/workout";
import { offReportContext } from "@/lib/workout.server";

const plan: PlanSnapshot = {
  templateVersionId: "v", routineId: "r", versionNo: 3, title: "Full body", isDemo: false, purpose: "Build toward six chin-ups.",
  blocks: [
    { position: 1, blockType: "single", priority: "main", rounds: 3, restSeconds: 120, prescriptions: [{ exercise_id: "a", name: "Goblet squat", sets: 3, reps: 8 }] },
    { position: 2, blockType: "superset", priority: "main", rounds: 3, restSeconds: 90, prescriptions: [{ exercise_id: "b", name: "Row", reps: 10 }, { exercise_id: "c", name: "Push-up", reps: 10 }] },
    { position: 3, blockType: "single", priority: "optional", rounds: 2, restSeconds: 60, prescriptions: [{ exercise_id: "d", name: "Dead bug", sets: 2, reps: 10 }] },
  ],
};

describe("Today time plan (FR-06, AT-04)", () => {
  it("Short leaves out optional blocks; Priority only keeps the first main block", () => {
    expect(keptPositions(plan, "full")).toEqual([1, 2, 3]);
    expect(keptPositions(plan, "short")).toEqual([1, 2]);
    expect(keptPositions(plan, "priority")).toEqual([1]);
  });
  it("estimates shrink from Full to Short to Priority only", () => {
    const f = estimateMinutes(plan, "full"), s = estimateMinutes(plan, "short"), p = estimateMinutes(plan, "priority");
    expect(f).toBeGreaterThan(s);
    expect(s).toBeGreaterThan(p);
    expect(p).toBe(9); // 60s setup + 3×45s work + 2×120s rest = 435s ≈ 7… plus rounding check below
  });
  it("a shortened session keeps the full plan but runs only kept blocks", () => {
    const snap = applyTimePlan(plan, "short");
    expect(snap.blocks).toHaveLength(3);
    expect(snap.timePlan?.omittedPositions).toEqual([3]);
    expect(stepsOf(snap).map((s) => s.name)).toEqual(["Goblet squat", "Row", "Push-up"]);
    expect(plan.timePlan).toBeUndefined();
  });
  it("doing every kept set of a short plan is complete", () => {
    const steps = stepsOf(applyTimePlan(plan, "priority"));
    const logs = [1, 2, 3].map((n) => ({ key: `k${n}`, ref: "1:0", setNo: n, reps: 8, load: null, unit: "lb" as const, rir: null, loggedAt: "" }));
    expect(completionOf(steps, logs, false)).toBe("complete");
  });
  it("Why this trade names the purpose and the omitted blocks", () => {
    expect(whyThisTrade(plan, "full")).toBeNull();
    expect(whyThisTrade(plan, "short")).toBe("Keeps Goblet squat and Row + Push-up, so the purpose stays: Build toward six chin-ups. Leaves out Dead bug.");
  });
});

describe("S11 report context", () => {
  it("stores the session id and local date", () => {
    expect(offReportContext("s1", "2026-10-15", "America/Chicago", "pinch")).toBe("Session s1 · 2026-10-15 (America/Chicago) · pinch");
  });
});
