import { describe, expect, it } from "vitest";
import { errorsByPath, templateErrorCodes, validateTemplate } from "@/v1/core/validate";
import { TEMPLATE_CASES, straight } from "./fixtures/template-cases";

describe("template validation (same cases as the SQL check)", () => {
  for (const c of TEMPLATE_CASES) {
    it(c.name, () => {
      expect(templateErrorCodes(c.tname, c.blocks).map((e) => [e.path, e.code])).toEqual(c.errors);
    });
  }
});

describe("field messages", () => {
  it("uses the editor copy", () => {
    const errs = validateTemplate({ name: "", blocks: [] });
    expect(errorsByPath(errs)).toEqual({
      name: "Give this workout a name.",
      blocks: "Add at least one exercise.",
    });
    const e2 = errorsByPath(
      validateTemplate({
        name: "A",
        blocks: [
          straight({ sets: 0, rest_s: 700 }, { reps: 0, name: " ", weight: 5, load_basis: null }),
        ],
      }),
    );
    expect(e2).toEqual({
      "blocks.0.rest_s": "Seconds, 0 to 600.",
      "blocks.0.sets": "Whole number, 1 to 20.",
      "blocks.0.exercise.name": "Exercise needs a name.",
      "blocks.0.exercise.reps": "Whole number, 1 to 200.",
      "blocks.0.exercise.load_basis": "Choose Per implement or Total load.",
    });
  });
});
