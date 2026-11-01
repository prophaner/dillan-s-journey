// TV dashboard key hints: OK always names the focused primary action (smoke-test fix).
import { describe, expect, it } from "vitest";
import { dashboardHints } from "@/v1/tv/dashboard-hints";

const ok = (h: Array<[string, string]>) => h.find(([k]) => k === "OK")?.[1];

describe("dashboardHints", () => {
  it("working set: OK = Complete set", () => {
    expect(ok(dashboardHints({ resting: false, hasStep: true }))).toBe("Complete set");
  });
  it("resting and rest finished: OK = Skip rest (the focused button)", () => {
    expect(ok(dashboardHints({ resting: true, hasStep: true }))).toBe("Skip rest");
    expect(ok(dashboardHints({ resting: true, hasStep: false }))).toBe("Skip rest");
  });
  it("all sets done: OK = End workout, never Complete set or Skip", () => {
    const h = dashboardHints({ resting: false, hasStep: false });
    expect(ok(h)).toBe("End workout");
    expect(h.map(([, v]) => v).join(" ")).not.toMatch(/Complete set|Skip/);
  });
});
