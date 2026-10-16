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
