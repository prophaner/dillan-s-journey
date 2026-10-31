import { describe, expect, it } from "vitest";
import {
  activeMinutes,
  calendarDayKey,
  localDateKey,
  monthGrid,
  monthQueryRange,
  monthRange,
  sessionsByDay,
  weekMetrics,
  weekRange,
  weekTrend,
  zonedToUtc,
  type HistorySession,
} from "@/v1/core/week";

const NY = "America/New_York";
const iso = (s: string) => Date.parse(s);
const H = 3_600_000;
const sess = (
  startIso: string,
  outcome: HistorySession["outcome"],
  minutes = 30,
  tz = NY,
): HistorySession => ({
  started_at: iso(startIso),
  active_ms: minutes * 60_000,
  outcome,
  start_timezone: tz,
});

describe("weeks (Monday-Sunday, user timezone, DST-safe)", () => {
  it("spring-forward week is 167 hours", () => {
    const w = weekRange(iso("2026-03-08T12:00:00Z"), NY);
    expect(new Date(w.start).toISOString()).toBe("2026-03-02T05:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect((w.end - w.start) / H).toBe(167);
    expect(w.startKey).toBe("2026-03-02");
  });

  it("fall-back week is 169 hours", () => {
    const w = weekRange(iso("2026-10-28T12:00:00Z"), NY);
    expect(new Date(w.start).toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect((w.end - w.start) / H).toBe(169);
  });

  it("a Sunday 23:30 session counts in the ending week (acceptance 29)", () => {
    const sunday = sess("2026-11-02T04:30:00Z", "completed"); // Sun Nov 1 23:30 EST
    expect(localDateKey(sunday.started_at, NY)).toBe("2026-11-01");
    const endingWeek = weekMetrics([sunday], iso("2026-11-02T03:00:00Z"), NY, 3);
    expect(endingWeek.week.startKey).toBe("2026-10-26");
    expect(endingWeek.completed).toBe(1);
    const nextWeek = weekMetrics([sunday], iso("2026-11-03T15:00:00Z"), NY, 3);
    expect(nextWeek.week.startKey).toBe("2026-11-02");
    expect(nextWeek.completed).toBe(0);
  });

  it("Monday 00:00 local starts a new week", () => {
    const w = weekRange(iso("2026-11-02T05:00:00Z"), NY);
    expect(w.startKey).toBe("2026-11-02");
    expect(weekRange(iso("2026-11-02T04:59:59Z"), NY).startKey).toBe("2026-10-26");
  });

  it("zonedToUtc handles the spring gap and the fall overlap", () => {
    expect(new Date(zonedToUtc(2026, 3, 8, 3, 0, NY)).toISOString()).toBe(
      "2026-03-08T07:00:00.000Z",
    );
    expect(new Date(zonedToUtc(2026, 11, 1, 0, 0, NY)).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(new Date(zonedToUtc(2026, 11, 1, 3, 0, NY)).toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
  });
});

describe("progress metrics", () => {
  const now = iso("2026-11-04T15:00:00Z"); // Wed Nov 4 10:00 EST
  const sessions = [
    sess("2026-11-02T12:00:00Z", "completed", 40),
    sess("2026-11-03T12:00:00Z", "partial", 20),
    sess("2026-11-03T18:00:00Z", "discarded", 50),
    sess("2026-11-04T12:00:00Z", null, 50), // unfinished: never counted
    sess("2026-10-27T12:00:00Z", "completed", 30),
    sess("2026-10-28T13:00:00Z", "completed", 30), // Wed 09:00 EDT: before "this point"
    sess("2026-10-28T15:00:00Z", "completed", 30), // Wed 11:00 EDT: after
    sess("2026-10-30T12:00:00Z", "partial", 10),
  ];

  it("counts completed toward the goal and partial separately; discarded never", () => {
    const m = weekMetrics(sessions, now, NY, 3);
    expect(m.goal).toBe(3);
    expect(m.completed).toBe(1);
    expect(m.partial).toBe(1);
    expect(activeMinutes(m.completedActiveMs)).toBe(40);
    expect(activeMinutes(m.partialActiveMs)).toBe(20);
    expect(activeMinutes(m.activeMs)).toBe(60);
  });

  it("compares with the same elapsed portion of last week in local wall time (across DST)", () => {
    const m = weekMetrics(sessions, now, NY, 3);
    expect(new Date(m.prevSameCutoff).toISOString()).toBe("2026-10-28T14:00:00.000Z");
    expect(m.prevSame.completed).toBe(2);
    expect(m.prevSame.partial).toBe(0);
    expect(activeMinutes(m.prevSame.activeMs)).toBe(60);
  });

  it("4-week trend, oldest first, current flagged", () => {
    const t = weekTrend(sessions, now, NY);
    expect(t.map((w) => w.startKey)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
    expect(t.map((w) => w.completed)).toEqual([0, 0, 3, 1]);
    expect(t.map((w) => w.partial)).toEqual([0, 0, 1, 1]);
    expect(t.map((w) => w.current)).toEqual([false, false, false, true]);
  });

  it("empty history", () => {
    const m = weekMetrics([], now, NY, 3);
    expect(m.completed + m.partial + m.activeMs + m.prevSame.completed).toBe(0);
  });
});

describe("calendar", () => {
  it("assigns a session to its local start date in its own start timezone", () => {
    const la = sess("2026-04-01T06:30:00Z", "completed", 30, "America/Los_Angeles"); // Mar 31 23:30 PDT
    expect(calendarDayKey(la)).toBe("2026-03-31");
    expect(localDateKey(la.started_at, NY)).toBe("2026-04-01"); // where the viewer is now
    const march = sessionsByDay([la], 2026, 3);
    expect([...march.keys()]).toEqual(["2026-03-31"]);
    expect(sessionsByDay([la], 2026, 4).size).toBe(0);
  });

  it("cross-midnight sessions stay on their start day; several per day are kept in order", () => {
    const a = sess("2026-11-08T04:50:00Z", "completed", 30); // Nov 7 23:50 EST
    const b = sess("2026-11-07T14:00:00Z", "partial", 30);
    const c = sess("2026-11-07T20:00:00Z", "discarded", 30);
    const m = sessionsByDay([a, b, c], 2026, 11);
    expect(m.get("2026-11-07")).toEqual([b, a]);
  });

  it("month ranges are DST-safe and the query range is padded", () => {
    const r = monthRange(2026, 3, NY);
    expect(new Date(r.start).toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(new Date(r.end).toISOString()).toBe("2026-04-01T04:00:00.000Z");
    const q = monthQueryRange(2026, 3);
    expect(q.from).toBeLessThan(iso("2026-03-01T00:00:00Z") - 26 * H);
    expect(q.to).toBeGreaterThan(iso("2026-04-01T00:00:00Z") + 26 * H);
    const dec = monthRange(2026, 12, NY);
    expect(new Date(dec.end).toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  it("Monday-first month grid", () => {
    const g = monthGrid(2026, 11); // Nov 1 2026 is a Sunday
    expect(g[0]).toEqual({ key: "2026-10-26", inMonth: false });
    expect(g[6]).toEqual({ key: "2026-11-01", inMonth: true });
    expect(g.length % 7).toBe(0);
    expect(g.filter((c) => c.inMonth).length).toBe(30);
  });
});
