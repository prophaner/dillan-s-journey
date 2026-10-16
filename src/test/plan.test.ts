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

/**
 * brief §10.2: "The web API must enforce authorization, input validation, ..."
 * brief §9.1: "Concurrent edits use explicit version checks. A session can keep its starting plan while
 *   future sessions use a newer one."
 * brief §13 AT-03 (User edits routine after past workout): "Past session and prescription snapshot remain unchanged"
 */
describe("validateRoutineSave rejects non-integer and out-of-range numbers (FR-05, §10.2 input validation)", () => {
  const base = { id: "00000000-0000-4000-8000-000000000009", routineId: snap.routineId, baseVersionId: snap.templateVersionId, baseVersionNo: 3, title: "x", purpose: null, isDemo: false, reason: null };
  const firstRx = (patch: Record<string, unknown>) => [
    { ...snap.blocks[0]!, prescriptions: [{ ...snap.blocks[0]!.prescriptions[0]!, ...patch }] },
    ...snap.blocks.slice(1),
  ];
  const firstBlock = (patch: Record<string, unknown>) => [{ ...snap.blocks[0]!, ...patch }, ...snap.blocks.slice(1)];

  it("the unmodified plan is accepted", () => {
    expect(validateRoutineSave({ ...base, blocks: snap.blocks }).blocks).toHaveLength(3);
  });
  it.each([3.5, 0, 21, -1])("sets = %p is rejected", (sets) => {
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ sets }) })).toThrow(/sets/);
  });
  it("sets at the bounds 1 and 20 are accepted", () => {
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ sets: 1 }) })).not.toThrow();
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ sets: 20 }) })).not.toThrow();
  });
  it.each([10.5, 0, 1001, -3])("reps = %p is rejected", (reps) => {
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ reps }) })).toThrow(/reps/);
  });
  it("reps at the bounds 1 and 1000 are accepted", () => {
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ reps: 1 }) })).not.toThrow();
    expect(() => validateRoutineSave({ ...base, blocks: firstRx({ reps: 1000 }) })).not.toThrow();
  });
  it("negative rest is rejected; 0 and null are fine", () => {
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ restSeconds: -1 }) })).toThrow(/block numbers/);
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ restSeconds: 0 }) })).not.toThrow();
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ restSeconds: null }) })).not.toThrow();
  });
  it.each([0, 21, 2.5, -1])("rounds = %p is rejected", (rounds) => {
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ rounds }) })).toThrow(/block numbers/);
  });
  it("rounds at the bounds 1 and 20 are accepted", () => {
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ rounds: 1 }) })).not.toThrow();
    expect(() => validateRoutineSave({ ...base, blocks: firstBlock({ rounds: 20 }) })).not.toThrow();
  });
  it("more than 40 blocks is rejected; exactly 40 is accepted", () => {
    const block = (position: number) => ({ ...snap.blocks[0]!, position });
    const forty = Array.from({ length: 40 }, (_, i) => block(i + 1));
    expect(validateRoutineSave({ ...base, blocks: forty }).blocks).toHaveLength(40);
    expect(() => validateRoutineSave({ ...base, blocks: [...forty, block(41)] })).toThrow(/blocks/);
  });
});

describe("diffPlans with the same exercise in two blocks", () => {
  const twoSquats = [
    ...snap.blocks,
    { position: 4, blockType: "single", priority: "main", rounds: 1, restSeconds: 90, prescriptions: [{ exercise_id: "a", name: "Squat", sets: 2, reps: 5, load: 70, unit: "lb" }] },
  ] as PlanSnapshot["blocks"];
  it("a reps change on the first Squat is reported", () => {
    const next = twoSquats.map((b, i) => (i === 0 ? { ...b, prescriptions: [{ ...b.prescriptions[0]!, reps: 8 }] } : b));
    expect(diffPlans(twoSquats, next)).toEqual(["Squat: reps 10 → 8"]);
  });
  it("removing the second Squat says Removed Squat", () => {
    expect(diffPlans(twoSquats, twoSquats.slice(0, 3))).toEqual(["Removed Squat"]);
  });
});

describe("toEdit then toBlocks preserves prescriptions (AT-03: the plan a session snapshots is the plan it ran)", () => {
  const rich: PlanSnapshot = {
    ...snap,
    blocks: [
      ...snap.blocks,
      {
        position: 4, blockType: "superset", priority: "main", rounds: 3, restSeconds: 120,
        prescriptions: [
          { exercise_id: "d", name: "Curl", sets: null, reps: 12, load: 20, unit: "lb", rir: 2, transition_seconds: 15 },
          { exercise_id: "e", name: "Extension", sets: null, reps: 12, load: 25, unit: "kg", rir: null, transition_seconds: null },
        ],
      },
    ],
  };

  it("round-trips every block and prescription field, including superset transitions, RIR, null load and unit", () => {
    expect(toBlocks(toEdit(rich))).toEqual(rich.blocks);
    expect(diffPlans(rich.blocks, toBlocks(toEdit(rich)))).toEqual([]);
  });
  it("sorts by position on the way in and renumbers 1..n on the way out", () => {
    const shuffled: PlanSnapshot = { ...rich, blocks: [rich.blocks[3]!, rich.blocks[1]!, rich.blocks[0]!, rich.blocks[2]!] };
    expect(toBlocks(toEdit(shuffled))).toEqual(rich.blocks);
  });
  it("the edit copy is deep: block and prescription edits never reach the frozen snapshot", () => {
    const eb = toEdit(rich);
    eb[3]!.restSeconds = 5;
    eb[3]!.prescriptions[0]!.transition_seconds = 99;
    eb[0]!.prescriptions.push({ exercise_id: "z", name: "Extra", sets: 1, reps: 1, load: null, unit: "lb" });
    expect(rich.blocks[3]!.restSeconds).toBe(120);
    expect(rich.blocks[3]!.prescriptions[0]!.transition_seconds).toBe(15);
    expect(rich.blocks[0]!.prescriptions).toHaveLength(1);
  });
});
