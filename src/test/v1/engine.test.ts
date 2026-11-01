import { describe, expect, it } from "vitest";
import { applyCommand, currentStep, initialState, isAfterLastSet } from "@/v1/core/engine";
import { buildSteps, timeline } from "@/v1/core/steps";
import {
  activeIntervals,
  activeMs,
  elapsedMs,
  formatDuration,
  restRemainingMs,
} from "@/v1/core/timing";
import { BLOCKS, CASES, T0, runCase } from "./fixtures/engine-harness";

describe("steps (acceptance 14)", () => {
  it("superset 2 x 3 -> A1, A2, rest, A1, A2, rest, A1, A2 with no trailing rest", () => {
    const t = timeline(buildSteps(BLOCKS["superset2x3"]!)).map((i) =>
      i.kind === "rest" ? "rest" : i.step.label,
    );
    expect(t).toEqual(["A1", "A2", "rest", "A1", "A2", "rest", "A1", "A2"]);
  });

  it("straight sets rest between sets but not after the final set of the workout", () => {
    const t = timeline(buildSteps(BLOCKS["straight3"]!)).map((i) =>
      i.kind === "rest" ? `rest${i.seconds}` : `set${i.step.set + 1}`,
    );
    expect(t).toEqual(["set1", "rest60", "set2", "rest60", "set3"]);
  });

  it("rest 0 inserts no rest; supersets are lettered in order", () => {
    const steps = buildSteps(BLOCKS["mixed"]!);
    const t = timeline(steps).map((i) =>
      i.kind === "rest" ? "rest" : (i.step.label ?? `s${i.step.set + 1}`),
    );
    expect(t).toEqual(["s1", "s2", "A1", "A2", "rest", "A1", "A2"]);
    expect(steps.map((s) => s.key)).toEqual(["0.0.0", "0.0.1", "1.0.0", "1.1.0", "1.0.1", "1.1.1"]);
    expect(steps[2]).toMatchObject({
      reps: 10,
      weight: 22.5,
      sets: 2,
      group: "A",
      last_in_round: false,
    });
  });
});

describe("engine fixtures (shared with the SQL engine)", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      await runCase(c, buildSteps(BLOCKS[c.blocks]!), (s, cmd, at) => applyCommand(s, cmd, at));
    });
  }
});

describe("engine helpers", () => {
  it("does not mutate the input state", () => {
    const s0 = initialState(BLOCKS["straight3"]!);
    const copy = structuredClone(s0);
    const r = applyCommand(s0, { kind: "start", expected_revision: 1 }, T0);
    expect(r.ok).toBe(true);
    expect(s0).toEqual(copy);
  });

  it("tracks the current step and the after-last-set state", () => {
    let s = initialState(BLOCKS["straight3"]!);
    s = applyCommand(s, { kind: "start", expected_revision: 1 }, T0).state;
    expect(currentStep(s)?.key).toBe("0.0.0");
    for (let i = 0; i < 3; i++) {
      s = applyCommand(
        s,
        { kind: "complete_set", payload: { step: i }, expected_revision: s.revision },
        T0 + i,
      ).state;
    }
    expect(isAfterLastSet(s)).toBe(true);
    expect(currentStep(s)).toBeNull();
  });
});

describe("timing", () => {
  const blocks = BLOCKS["straight3"]!;
  const run = () => {
    let s = initialState(blocks);
    const step = (kind: string, at: number, payload?: Record<string, number>) => {
      const r = applyCommand(
        s,
        { kind, expected_revision: s.revision, ...(payload ? { payload } : {}) },
        T0 + at,
      );
      expect(r.ok).toBe(true);
      s = r.state;
    };
    return { step, get: () => s };
  };

  it("pause excludes time from active and freezes rest; elapsed keeps counting", () => {
    const { step, get } = run();
    step("start", 0);
    step("complete_set", 10_000, { step: 0 }); // rest until 70 s
    step("pause", 20_000);
    expect(restRemainingMs(get(), T0 + 45_000)).toBe(50_000);
    expect(activeMs(get(), T0 + 45_000)).toBe(20_000);
    expect(elapsedMs(get(), T0 + 45_000)).toBe(45_000);
    step("resume", 50_000);
    expect(restRemainingMs(get(), T0 + 50_000)).toBe(50_000);
    expect(activeMs(get(), T0 + 60_000)).toBe(30_000);
    expect(activeIntervals(get(), T0 + 60_000)).toEqual([
      { from: T0, to: T0 + 20_000 },
      { from: T0 + 50_000, to: T0 + 60_000 },
    ]);
    step("end", 80_000);
    expect(activeMs(get(), T0 + 999_999)).toBe(50_000);
    expect(elapsedMs(get(), T0 + 999_999)).toBe(80_000);
    expect(restRemainingMs(get(), T0 + 90_000)).toBeNull();
  });

  it("before start everything is zero; rest never goes negative", () => {
    const { step, get } = run();
    expect(activeMs(get(), T0 + 5000)).toBe(0);
    expect(activeIntervals(get(), T0)).toEqual([]);
    step("start", 0);
    step("complete_set", 0, { step: 0 });
    expect(restRemainingMs(get(), T0 + 120_000)).toBe(0);
  });

  it("formats durations", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
