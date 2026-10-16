/**
 * brief §5 FR-10 (Body measurements, assessments, and progress):
 *   "Store unit, body site/side, method, timestamp, and optional conditions."
 *   "Acceptance: unit conversion does not change meaning; bilateral measurements remain distinct"
 * brief §13 AT-22 (Measurement units or protocol change):
 *   "Values convert correctly; comparability qualifications preserved"
 */
import { describe, expect, it } from "vitest";
import { bmi, convert, gaps, groupSeries, parseValue, steadyWeeks, validateMeasurement } from "@/lib/measurements";

const id = "11111111-1111-4111-8111-111111111111";
const base = { id, type: "arm", site: null, side: "left", enteredValue: "13.5", unit: "in", method: null, conditions: null, observedAt: "2026-10-01T08:00:00Z" };

describe("measurements (FR-10)", () => {
  it("left and right arm stay separate series", () => {
    const rows = [
      { id: "a", type: "arm", site: null, side: "left", value: 13.5, unit: "in", observed_at: "2026-10-01" },
      { id: "b", type: "arm", site: null, side: "right", value: 13.8, unit: "in", observed_at: "2026-10-01" },
    ];
    expect(groupSeries(rows).size).toBe(2);
  });
  it("a sided measurement without a side is rejected", () => {
    expect(() => validateMeasurement({ ...base, side: "none" })).toThrow();
  });
  it("stores the value as typed, no conversion", () => {
    const m = validateMeasurement({ ...base, enteredValue: "34,5", unit: "cm" });
    expect(m.value).toBe(34.5);
    expect(m.unit).toBe("cm");
  });
  it("text that isn't a number is not a value", () => {
    expect(parseValue("abc")).toBeNull();
    expect(parseValue("0")).toBeNull();
  });
  it("conversion round-trips without changing meaning", () => {
    expect(convert(convert(180, "lb", "kg"), "kg", "lb")).toBeCloseTo(180, 6);
  });
  it("BMI is unknown without both weight and height", () => {
    expect(bmi({ value: 180, unit: "lb" }, null)).toBeNull();
    expect(bmi({ value: 70, unit: "kg" }, { value: 175, unit: "cm" })).toBe(22.9);
  });
  it("gaps over three weeks are reported, not hidden", () => {
    expect(gaps(["2026-09-01", "2026-09-08", "2026-10-06"])).toEqual([{ from: "2026-09-08", to: "2026-10-06", days: 28 }]);
  });
  it("steady weeks is unknown without a weekly target, and the current week never counts", () => {
    const s = [{ local_date: "2026-10-05", completion: "complete", shortened: false }];
    expect(steadyWeeks(s, "2026-10-16", null).steady).toBeNull();
    const r = steadyWeeks(s, "2026-10-16", 1);
    expect(r.steady).toBe(1);
    expect(r.of).toBe(7);
  });
  it("a stopped full-plan session is partial, not shortened", () => {
    const r = steadyWeeks([{ local_date: "2026-10-14", completion: "stopped", shortened: false }], "2026-10-16", null);
    expect(r.cols.at(-1)!.pips).toEqual(["partial"]);
  });
});

describe("validateMeasurement: unit must match the type's kind (FR-10 store unit; AT-22)", () => {
  it("a mass type in a length unit is rejected", () => {
    expect(() => validateMeasurement({ ...base, type: "weight", side: "none", enteredValue: "180", unit: "cm" })).toThrow(/unit/);
    expect(() => validateMeasurement({ ...base, type: "weight", side: "none", enteredValue: "180", unit: "in" })).toThrow(/unit/);
  });
  it("a length type in a mass unit is rejected", () => {
    expect(() => validateMeasurement({ ...base, type: "waist", side: "none", enteredValue: "34", unit: "kg" })).toThrow(/unit/);
    expect(() => validateMeasurement({ ...base, type: "arm", enteredValue: "13.5", unit: "lb" })).toThrow(/unit/);
  });
  it("the matching unit of either system is accepted and kept as typed", () => {
    expect(validateMeasurement({ ...base, type: "weight", side: "none", enteredValue: "180", unit: "lb" }).unit).toBe("lb");
    expect(validateMeasurement({ ...base, type: "weight", side: "none", enteredValue: "82", unit: "kg" }).unit).toBe("kg");
    expect(validateMeasurement({ ...base, type: "waist", side: "none", enteredValue: "34", unit: "in" }).unit).toBe("in");
  });
  // validateMeasurement only checks that observedAt parses (Date.parse !== NaN); a date in the future
  // passes today. Flip to `it` once the product rejects it — do not change product code from here.
  it.todo("an observed_at in the future is rejected");
  it("an observed_at that is not a date is rejected", () => {
    expect(() => validateMeasurement({ ...base, observedAt: "yesterday-ish" })).toThrow(/date/);
    expect(() => validateMeasurement({ ...base, observedAt: "" })).toThrow(/date/);
  });
});

describe("convert: display-only conversion (AT-22)", () => {
  it("same unit in and out is the identity", () => {
    expect(convert(72.5, "in", "in")).toBe(72.5);
    expect(convert(80, "kg", "kg")).toBe(80);
  });
  it("length round-trips without changing meaning", () => {
    expect(convert(convert(86.4, "cm", "in"), "in", "cm")).toBeCloseTo(86.4, 6);
  });
  // Current behavior, documented on purpose: a pair convert() does not know (mass↔length, or an
  // unknown unit string) returns the input unchanged rather than throwing or returning NaN/null.
  // If this is later made strict, this test is the one that should flip — deliberately.
  it("an unknown unit pair returns the input unchanged", () => {
    expect(convert(180, "lb", "cm")).toBe(180);
    expect(convert(34, "in", "kg")).toBe(34);
    expect(convert(5, "stone", "kg")).toBe(5);
  });
});

describe("steadyWeeks: the current week never counts; no target means unknown (FR-10 consistency)", () => {
  // 2026-10-16 is a Friday; its week starts Monday 2026-10-12.
  const today = "2026-10-16";
  it("a complete session in the current week is shown but not counted as a steady week", () => {
    const current = [{ local_date: "2026-10-13", completion: "complete", shortened: false }];
    const r = steadyWeeks(current, today, 1);
    expect(r.cols.at(-1)!.current).toBe(true);
    expect(r.cols.at(-1)!.pips).toEqual(["done"]);
    expect(r.steady).toBe(0);
    expect(r.of).toBe(7);
    expect(r.cols.filter((c) => c.current)).toHaveLength(1);
    expect(r.cols.filter((c) => !c.current)).toHaveLength(r.of);
  });
  it("the same session one week earlier does count", () => {
    const past = [{ local_date: "2026-10-06", completion: "complete", shortened: false }];
    expect(steadyWeeks(past, today, 1).steady).toBe(1);
  });
  it("without a weekly target steady is null even when every past week was trained", () => {
    const everyWeek = Array.from({ length: 8 }, (_, i) => {
      const d = new Date("2026-10-13T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 7 * i);
      return { local_date: d.toISOString().slice(0, 10), completion: "complete", shortened: false };
    });
    const r = steadyWeeks(everyWeek, today, null);
    expect(r.steady).toBeNull();
    expect(r.of).toBe(7);
    // The pips still show what happened; only the count is unknown.
    expect(r.cols.every((c) => c.pips.includes("done"))).toBe(true);
  });
  it("a target of 0 is treated as unknown, not as always steady", () => {
    expect(steadyWeeks([], today, 0).steady).toBeNull();
  });
});
