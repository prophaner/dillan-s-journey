import { describe, expect, it } from "vitest";
import { buildSteps } from "@/v1/core/steps";
import { errorsByPath, validateTemplate } from "@/v1/core/validate";
import {
  addExercise,
  convertToStraight,
  draftFromTemplate,
  moveExercise,
  newDraft,
  patchBlock,
  patchExercise,
  removeExercise,
  setName,
  setSetType,
  supersetLetters,
  toBody,
  type Draft,
} from "@/v1/ui/editor-model";
import { zoneFieldErrors, ZONES_INCREASE, ZONES_RANGE } from "@/v1/ui/zones-model";

function twoStraight(): Draft {
  let d = setName(newDraft("lb"), "Arms");
  d = patchExercise(d, 0, 0, { name: "Curl" });
  d = addExercise(d, "lb");
  return patchExercise(d, 1, 0, { name: "Press" });
}

describe("editor model", () => {
  it("new workout = one blank exercise with 60 s rest; blank weight is bodyweight (null), not 0", () => {
    const d = newDraft("kg");
    expect(d.blocks).toHaveLength(1);
    const b = toBody(d).blocks[0]!;
    expect(b.type).toBe("straight");
    if (b.type === "straight") {
      expect(b.rest_s).toBe(60);
      expect(b.exercise.weight).toBeNull();
      expect(b.exercise.unit).toBe("kg");
    }
  });

  it("validation paths address draft fields with the core messages", () => {
    let d = newDraft("lb");
    d = patchBlock(d, 0, { sets: "2.5" });
    d = patchExercise(d, 0, 0, { weight: "30" });
    expect(errorsByPath(validateTemplate(toBody(d)))).toEqual({
      name: "Give this workout a name.",
      "blocks.0.sets": "Whole number, 1 to 20.",
      "blocks.0.exercise.name": "Exercise needs a name.",
      "blocks.0.exercise.load_basis": "Choose Per implement or Total load.",
    });
  });

  it("Straight → Superset joins the next exercise; 2 × 3 rounds = A1 A2 rest ... (acceptance 14)", () => {
    let d = setSetType(twoStraight(), 0, 0, "superset", "lb");
    expect(d.blocks).toHaveLength(1);
    expect(supersetLetters(d)).toEqual({ 0: "A" });
    d = patchBlock(d, 0, { rounds: "3", rest_s: "90" });
    const body = toBody(d);
    expect(validateTemplate(body)).toEqual([]);
    const steps = buildSteps(body.blocks);
    expect(steps.map((s) => s.label)).toEqual(["A1", "A2", "A1", "A2", "A1", "A2"]);
    expect(steps.filter((s) => s.last_in_round).map((s) => s.index)).toEqual([1, 3, 5]);
  });

  it("superset on the last card starts a group with a new blank member", () => {
    const d = setSetType(setName(newDraft("lb"), "X"), 0, 0, "superset", "lb");
    expect(d.blocks[0]?.type).toBe("superset");
    if (d.blocks[0]?.type === "superset") expect(d.blocks[0].exercises).toHaveLength(2);
  });

  it("moving a member out of its group breaks it; a one-member group is invalid until converted", () => {
    const grouped = setSetType(twoStraight(), 0, 0, "superset", "lb");
    const { draft, leftGroup } = moveExercise(grouped, 0, 1, 1);
    expect(leftGroup).toBe("A");
    expect(draft.blocks.map((b) => b.type)).toEqual(["superset", "straight"]);
    expect(errorsByPath(validateTemplate(toBody(draft)))["blocks.0.exercises"]).toBe(
      "A superset needs at least two exercises next to each other.",
    );
    const fixed = convertToStraight(draft, 0);
    expect(fixed.blocks.map((b) => b.type)).toEqual(["straight", "straight"]);
    expect(validateTemplate(toBody(fixed))).toEqual([]);
  });

  it("a straight exercise moves past a whole superset, never into it", () => {
    let d = addExercise(setSetType(twoStraight(), 0, 0, "superset", "lb"), "lb");
    d = patchExercise(d, 1, 0, { name: "Row" });
    const { draft } = moveExercise(d, 1, 0, -1);
    expect(draft.blocks.map((b) => b.type)).toEqual(["straight", "superset"]);
  });

  it("removing exercises and round-tripping a template", () => {
    const d = setSetType(twoStraight(), 0, 0, "superset", "lb");
    const body = toBody(d);
    expect(draftFromTemplate(body)).toEqual(d);
    expect(removeExercise(d, 0, 0).blocks[0]?.type).toBe("superset");
    expect(removeExercise(removeExercise(d, 0, 0), 0, 0).blocks).toEqual([]);
  });
});

describe("zones editor validation", () => {
  it("accepts four strictly increasing whole numbers", () => {
    expect(zoneFieldErrors(["114", "133", "152", "171"])).toBeNull();
  });
  it("flags the boundary that does not increase", () => {
    expect(zoneFieldErrors(["114", "133", "120", "171"])).toEqual([
      null,
      null,
      ZONES_INCREASE,
      null,
    ]);
    expect(zoneFieldErrors(["114", "114", "152", "171"])).toEqual([
      null,
      ZONES_INCREASE,
      null,
      null,
    ]);
  });
  it("flags blanks and out-of-range values", () => {
    expect(zoneFieldErrors(["", "133", "152", "300"])).toEqual([
      ZONES_RANGE,
      null,
      null,
      ZONES_RANGE,
    ]);
  });
});
