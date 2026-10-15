import { describe, expect, it } from "vitest";
import {
  buildOnboardingPayload, emptyAnswers, parseCount, summarize, validateOnboardingPayload,
} from "@/lib/onboarding";
import { enqueue } from "@/lib/outbox";
import { MissingVersionError } from "@/lib/updates";

describe("S12 onboarding rules", () => {
  it("skipping everything keeps every answer unknown, never 0", () => {
    const p = buildOnboardingPayload(emptyAnswers());
    expect(p.daysPerWeek).toBeNull();
    expect(p.sessionMinutes).toBeNull();
    expect(p.limitationsAnswer).toBeNull();
    expect(summarize(p).every((r) => r.value === null)).toBe(true);
  });

  it("a blank or zero count in a routine row stays unknown", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("0")).toBeNull();
    expect(parseCount("8")).toBe(8);
  });

  it("an existing routine is saved as entered and replaces the demo", () => {
    const a = emptyAnswers();
    a.routineMode = "own";
    a.routineName = "Pull + Core";
    a.routineRows = [{ name: "Chin-up negative", sets: "3", reps: "", load: "" }];
    const p = buildOnboardingPayload(a);
    expect(p.routine).toEqual({ title: "Pull + Core", rows: [{ name: "Chin-up negative", sets: 3, reps: null, load: null, unit: "lb" }] });
    expect(p.keepDemo).toBe(false);
  });

  it("without a routine the demo routine is kept", () => {
    expect(buildOnboardingPayload(emptyAnswers()).keepDemo).toBe(true);
  });

  it('"Nothing I know of" saves no limitations but is recorded as an answer', () => {
    const a = emptyAnswers();
    a.limitations = [{ area: "Knee", side: "left" }];
    a.limitationsAnswer = "none_known";
    const p = buildOnboardingPayload(a);
    expect(p.limitations).toEqual([]);
    expect(p.limitationsAnswer).toBe("none_known");
  });

  it("at most three goals are kept", () => {
    const a = emptyAnswers();
    a.goalWords = "lots";
    a.goals = ["a", "b", "c", "d"];
    expect(buildOnboardingPayload(a).goals).toHaveLength(3);
  });

  it("the server rejects a payload with a made-up value", () => {
    const p = buildOnboardingPayload(emptyAnswers());
    expect(() => validateOnboardingPayload({ ...p, daysPerWeek: 0 })).toThrow();
    expect(validateOnboardingPayload(p)).toEqual(p);
  });

  it("finishing onboarding without the profile version is refused", async () => {
    await expect(enqueue("acct", "onboarding:complete", {})).rejects.toThrow(MissingVersionError);
  });
});
