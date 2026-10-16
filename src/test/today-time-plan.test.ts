/**
 * brief §5 FR-06 (Planning and time adaptation):
 *   "provide a full session plus a shorter version preserving the main objective. Include setup,
 *    transitions, rest, and user pace in duration estimates; clearly label estimates."
 *   "Acceptance: switching from a full session to a shorter plan preserves the original plan snapshot,
 *    explains omissions, and records what was actually performed."
 * brief §13 AT-04 (Available time is reduced):
 *   "Short plan explains retained purpose and omitted blocks"
 */
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
    expect(p).toBe(7); // 60s setup + 3×45s work + 2×120s rest = 435s
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

describe("applyTimePlan preserves the original plan snapshot (FR-06 acceptance, AT-04)", () => {
  const choices = ["full", "short", "priority"] as const;
  it("never mutates the input routine, for any choice", () => {
    const before = structuredClone(plan);
    for (const c of choices) {
      const out = applyTimePlan(plan, c);
      expect(out).not.toBe(plan);
      expect(out.timePlan?.choice).toBe(c);
    }
    expect(plan).toEqual(before);
    expect(plan.timePlan).toBeUndefined();
  });
  it("keeps every block of the full plan in the snapshot, whatever is omitted", () => {
    for (const c of choices) {
      const out = applyTimePlan(plan, c);
      expect(out.blocks).toEqual(plan.blocks);
      expect(out.blocks.map((b) => b.position).sort()).toEqual([1, 2, 3]);
    }
  });
  it("a re-applied choice starts from the stored snapshot, not the previous time plan", () => {
    const short = applyTimePlan(plan, "short");
    const back = applyTimePlan(short, "full");
    expect(back.timePlan?.omittedPositions).toEqual([]);
    expect(short.timePlan?.omittedPositions).toEqual([3]); // the earlier snapshot is untouched
  });
});

describe("stepsOf honours omitted positions; the session records what was actually performed (FR-06)", () => {
  it("runs only kept blocks, in position order", () => {
    const snap: PlanSnapshot = { ...plan, timePlan: { choice: "short", omittedPositions: [1, 3], estMinutes: 10 } };
    expect(stepsOf(snap).map((s) => s.name)).toEqual(["Row", "Push-up"]);
  });
  it("omitting every block leaves nothing to run; omitting none runs the full plan", () => {
    const none: PlanSnapshot = { ...plan, timePlan: { choice: "priority", omittedPositions: [1, 2, 3], estMinutes: 0 } };
    expect(stepsOf(none)).toEqual([]);
    const all: PlanSnapshot = { ...plan, timePlan: { choice: "full", omittedPositions: [], estMinutes: 30 } };
    expect(stepsOf(all).map((s) => s.name)).toEqual(["Goblet squat", "Row", "Push-up", "Dead bug"]);
  });
  it("without a time plan the full plan runs", () => {
    expect(stepsOf(plan).map((s) => s.name)).toEqual(["Goblet squat", "Row", "Push-up", "Dead bug"]);
  });
});

describe("whyThisTrade names every omitted block and every kept block (AT-04)", () => {
  const nameOf = (position: number) => plan.blocks.find((b) => b.position === position)!.prescriptions.map((p) => p.name).join(" + ");
  it.each(["short", "priority"] as const)("%s: each omitted block appears after 'Leaves out', each kept block after 'Keeps'", (choice) => {
    const text = whyThisTrade(plan, choice)!;
    expect(text).not.toBeNull();
    const kept = new Set(keptPositions(plan, choice));
    const [keepsPart, leavesPart] = text.split("Leaves out");
    expect(leavesPart).toBeDefined();
    for (const b of plan.blocks) {
      const name = nameOf(b.position);
      if (kept.has(b.position)) {
        expect(keepsPart).toContain(name);
        expect(leavesPart).not.toContain(name);
      } else {
        expect(leavesPart).toContain(name);
      }
    }
  });
  it("Priority only leaves out two blocks and names both", () => {
    expect(whyThisTrade(plan, "priority")).toBe("Keeps Goblet squat, so the purpose stays: Build toward six chin-ups. Leaves out Row + Push-up and Dead bug.");
  });
  it("a plan with nothing optional says so instead of inventing an omission", () => {
    const allMain: PlanSnapshot = { ...plan, blocks: plan.blocks.map((b) => ({ ...b, priority: "main" })) };
    expect(whyThisTrade(allMain, "short")).toMatch(/Nothing to leave out/);
    expect(whyThisTrade(allMain, "short")).not.toContain("Leaves out");
  });
});

describe("estimates are monotone: full ≥ short ≥ priority (FR-06 labelled estimates)", () => {
  const monotone = (s: PlanSnapshot) => {
    const f = estimateMinutes(s, "full"), sh = estimateMinutes(s, "short"), p = estimateMinutes(s, "priority");
    expect(f).toBeGreaterThanOrEqual(sh);
    expect(sh).toBeGreaterThanOrEqual(p);
    expect(p).toBeGreaterThanOrEqual(0);
  };
  it("for the mixed main/optional plan", () => monotone(plan));
  it("for a plan with no optional blocks (full equals short, both above priority)", () => {
    const allMain: PlanSnapshot = { ...plan, blocks: plan.blocks.map((b) => ({ ...b, priority: "main" })) };
    monotone(allMain);
    expect(estimateMinutes(allMain, "full")).toBe(estimateMinutes(allMain, "short"));
  });
  it("for a plan with only optional blocks (short and priority fall back to the first block)", () => {
    const allOptional: PlanSnapshot = { ...plan, blocks: plan.blocks.map((b) => ({ ...b, priority: "optional" })) };
    monotone(allOptional);
    expect(estimateMinutes(allOptional, "short")).toBe(estimateMinutes(allOptional, "priority"));
  });
  it("for a single-block plan every choice estimates the same", () => {
    const one: PlanSnapshot = { ...plan, blocks: [plan.blocks[0]!] };
    monotone(one);
    expect(new Set(["full", "short", "priority"].map((c) => estimateMinutes(one, c as "full")))).toHaveProperty("size", 1);
  });
  it("for an empty plan every estimate is 0", () => {
    const empty: PlanSnapshot = { ...plan, blocks: [] };
    monotone(empty);
    expect(estimateMinutes(empty, "full")).toBe(0);
  });
});

describe("S11 report context", () => {
  it("stores the session id and local date", () => {
    expect(offReportContext("s1", "2026-10-15", "America/Chicago", "pinch")).toBe("Session s1 · 2026-10-15 (America/Chicago) · pinch");
  });
});
