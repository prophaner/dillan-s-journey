import { describe, expect, it } from "vitest";
import { diffPlans, groupWithNext, move, problems, toBlocks, toEdit, ungroup, validateRoutineSave, exerciseBadge } from "@/lib/plan";
import { keptPositions, priorityPosition } from "@/lib/time-plan";
import { stepsOf, turnsOf, type PlanSnapshot } from "@/lib/workout";

const snap: PlanSnapshot = {
  templateVersionId: "00000000-0000-4000-8000-000000000001", routineId: "00000000-0000-4000-8000-000000000002",
  versionNo: 3, title: "Full body", isDemo: false,
  blocks: [
    { position: 1, blockType: "single", priority: "main", rounds: 1, restSeconds: 90, prescriptions: [{ exercise_id: "a", name: "Squat", sets: 3, reps: 10, load: 50, unit: "lb" }] },
    { position: 2, blockType: "single", priority: "optional", rounds: 1, restSeconds: 60, prescriptions: [{ exercise_id: "b", name: "Row", sets: 3, reps: 10, load: 30, unit: "lb" }] },
    { position: 3, blockType: "single", priority: "main", rounds: 1, restSeconds: 60, prescriptions: [{ exercise_id: "c", name: "Push-up", sets: 3, reps: 15, load: null, unit: "lb" }] },
  ],
};

describe("routine editor (FR-05, AT-03)", () => {
  it("editing reps shows in the diff and leaves the base snapshot untouched", () => {
    const eb = toEdit(snap);
    eb[0]!.prescriptions[0]!.reps = 8;
    expect(diffPlans(snap.blocks, toBlocks(eb))).toContain("Squat: reps 10 → 8");
    expect(snap.blocks[0]!.prescriptions[0]!.reps).toBe(10);
  });
  it("no edits means no changes, so nothing to save", () => {
    expect(diffPlans(snap.blocks, toBlocks(toEdit(snap)))).toEqual([]);
  });
  it("move up/down renumbers positions", () => {
    const out = toBlocks(move(toEdit(snap), 2, -1));
    expect(out.map((b) => b.prescriptions[0]!.name)).toEqual(["Squat", "Push-up", "Row"]);
    expect(out.map((b) => b.position)).toEqual([1, 2, 3]);
  });
  it("group with next makes a superset with rounds; each exercise keeps its own reps", () => {
    const g = toBlocks(groupWithNext(toEdit(snap), 1));
    expect(g).toHaveLength(2);
    expect(g[1]!.blockType).toBe("superset");
    expect(g[1]!.rounds).toBe(3);
    const turns = turnsOf(stepsOf({ ...snap, blocks: g }).filter((s) => s.blockType === "superset"));
    expect(turns.filter((t) => t.round === 2).map((t) => [t.step.name, t.step.reps])).toEqual([["Row", 10], ["Push-up", 15]]);
  });
  it("ungroup returns separate blocks with sets = rounds", () => {
    const g = groupWithNext(toEdit(snap), 1);
    g[1]!.rounds = 4;
    const u = toBlocks(ungroup(g, 1));
    expect(u).toHaveLength(3);
    expect(u[1]!.prescriptions[0]!.sets).toBe(4);
    expect(u[2]!.blockType).toBe("single");
  });
  it("an exercise with no sets blocks saving", () => {
    const eb = toEdit(snap);
    eb[0]!.prescriptions[0]!.sets = null;
    expect(problems(eb).length).toBeGreaterThan(0);
  });
  it("the server rejects two priority blocks and a save without blocks", () => {
    const base = { id: "00000000-0000-4000-8000-000000000009", routineId: snap.routineId, baseVersionId: snap.templateVersionId, baseVersionNo: 3, title: "x", purpose: null, isDemo: false, reason: null };
    expect(() => validateRoutineSave({ ...base, blocks: [] })).toThrow();
    const two = snap.blocks.map((b) => ({ ...b, priority: "priority" }));
    expect(() => validateRoutineSave({ ...base, blocks: two })).toThrow(/priority/);
    expect(validateRoutineSave({ ...base, blocks: snap.blocks }).blocks).toHaveLength(3);
  });
});

describe("priority block (Today time choices)", () => {
  it("Priority only keeps the block marked priority", () => {
    const s = { ...snap, blocks: snap.blocks.map((b) => (b.position === 3 ? { ...b, priority: "priority" } : b)) };
    expect(priorityPosition(s)).toBe(3);
    expect(keptPositions(s, "short")).toEqual([1, 3]);
  });
});

describe("exercise badge", () => {
  it("your own exercise is Yours; a reviewed library one is Reviewed", () => {
    expect(exerciseBadge({ owner_id: "u1", review_status: "draft" }, "u1")).toBe("Yours");
    expect(exerciseBadge({ owner_id: null, review_status: "reviewed" }, "u1")).toBe("Reviewed");
    expect(exerciseBadge({ owner_id: null, review_status: "draft" }, "u1")).toBe("Not reviewed");
  });
});
