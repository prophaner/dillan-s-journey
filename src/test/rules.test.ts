import { describe, expect, it } from "vitest";
import { elapsedMs, formatClock, remainingMs } from "@/lib/timer";

describe("timers survive a locked screen (derived from timestamps)", () => {
  it("rest time left is correct after 60s away, regardless of ticks", () => {
    const start = 1_000_000;
    expect(remainingMs(start, 90_000, start + 60_000)).toBe(30_000);
  });
  it("rest never goes below zero", () => {
    expect(remainingMs(0, 90_000, 200_000)).toBe(0);
  });
  it("elapsed session time formats as m:ss", () => {
    expect(formatClock(elapsedMs(0, 14 * 60_000 + 52_000))).toBe("14:52");
  });
});
