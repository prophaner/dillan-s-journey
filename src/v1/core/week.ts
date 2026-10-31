// Week, progress and calendar math (build-plan D14/D16, handoff 4.6/4.7).
//  - week = Monday 00:00 to next Monday 00:00 in the user's IANA timezone (DST-safe: weeks may
//    be 167 or 169 hours long)
//  - progress counts completed sessions toward the goal/trend; partial ones are separate
//  - discarded and unfinished sessions never count
//  - calendar day = local start date in the session's own start timezone (history does not move
//    when the user travels)
// Uses Intl only (no tz library).

export interface HistorySession {
  id?: string;
  started_at: number; // epoch ms
  active_ms: number;
  outcome: "completed" | "partial" | "discarded" | null;
  start_timezone: string;
}

interface LocalParts {
  y: number;
  m: number; // 1..12
  d: number;
  h: number;
  mi: number;
  s: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localParts(ms: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    y: out["year"] as number,
    m: out["month"] as number,
    d: out["day"] as number,
    h: (out["hour"] as number) % 24,
    mi: out["minute"] as number,
    s: out["second"] as number,
  };
}

/** UTC offset of `tz` at instant `ms`, in ms (local - UTC). */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/** Instant of a local wall-clock time in `tz`. Gaps (spring forward) resolve forward. */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
  s = 0,
): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = tzOffsetMs(guess - tzOffsetMs(guess, tz), tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' of instant `ms` in `tz` */
export function localDateKey(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return dateKey(p.y, p.m, p.d);
}

/** Calendar day of a session: its local start date in its own start timezone. */
export function calendarDayKey(s: Pick<HistorySession, "started_at" | "start_timezone">): string {
  return localDateKey(s.started_at, s.start_timezone);
}

function shiftDate(
  y: number,
  m: number,
  d: number,
  days: number,
): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 0 = Monday ... 6 = Sunday, for a local calendar date */
export function mondayIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export interface WeekRange {
  start: number; // Monday 00:00 local, epoch ms
  end: number; // next Monday 00:00 local (exclusive)
  startKey: string;
}

export function weekRange(ms: number, tz: string, offsetWeeks = 0): WeekRange {
  const p = localParts(ms, tz);
  const mon = shiftDate(p.y, p.m, p.d, -mondayIndex(p.y, p.m, p.d) + offsetWeeks * 7);
  const next = shiftDate(mon.y, mon.m, mon.d, 7);
  return {
    start: zonedToUtc(mon.y, mon.m, mon.d, 0, 0, tz),
    end: zonedToUtc(next.y, next.m, next.d, 0, 0, tz),
    startKey: dateKey(mon.y, mon.m, mon.d),
  };
}

const counts = (sessions: HistorySession[]) => {
  const completed = sessions.filter((s) => s.outcome === "completed");
  const partial = sessions.filter((s) => s.outcome === "partial");
  const sum = (xs: HistorySession[]) => xs.reduce((n, s) => n + s.active_ms, 0);
  return {
    completed: completed.length,
    partial: partial.length,
    completedActiveMs: sum(completed),
    partialActiveMs: sum(partial),
    activeMs: sum(completed) + sum(partial),
  };
};

export type PeriodCounts = ReturnType<typeof counts>;

export interface WeekMetrics extends PeriodCounts {
  goal: number;
  week: WeekRange;
  /** previous week up to the same local weekday and time ("vs last week at this point") */
  prevSame: PeriodCounts;
  prevSameCutoff: number;
}

const counted = (s: HistorySession) => s.outcome === "completed" || s.outcome === "partial";

export function weekMetrics(
  sessions: HistorySession[],
  nowMs: number,
  tz: string,
  goal: number,
): WeekMetrics {
  const week = weekRange(nowMs, tz);
  const prev = weekRange(nowMs, tz, -1);
  const p = localParts(nowMs, tz);
  const back = shiftDate(p.y, p.m, p.d, -7);
  const cutoff = zonedToUtc(back.y, back.m, back.d, p.h, p.mi, tz, p.s);
  const valid = sessions.filter(counted);
  const inWeek = valid.filter((s) => s.started_at >= week.start && s.started_at < week.end);
  const inPrev = valid.filter(
    (s) => s.started_at >= prev.start && s.started_at <= cutoff && s.started_at < prev.end,
  );
  return { goal, week, ...counts(inWeek), prevSame: counts(inPrev), prevSameCutoff: cutoff };
}

export interface TrendWeek extends WeekRange {
  completed: number;
  partial: number;
  current: boolean;
}

/** Sessions per week, last `n` weeks, oldest first ("Sessions per week · last 4"). */
export function weekTrend(
  sessions: HistorySession[],
  nowMs: number,
  tz: string,
  n = 4,
): TrendWeek[] {
  const valid = sessions.filter(counted);
  const out: TrendWeek[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const w = weekRange(nowMs, tz, -k);
    const inW = valid.filter((s) => s.started_at >= w.start && s.started_at < w.end);
    out.push({
      ...w,
      completed: inW.filter((s) => s.outcome === "completed").length,
      partial: inW.filter((s) => s.outcome === "partial").length,
      current: k === 0,
    });
  }
  return out;
}

export function activeMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

/** Local month [start, end) in `tz` (DST-safe). month is 1..12. */
export function monthRange(
  year: number,
  month: number,
  tz: string,
): { start: number; end: number } {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    start: zonedToUtc(year, month, 1, 0, 0, tz),
    end: zonedToUtc(next.y, next.m, 1, 0, 0, tz),
  };
}

/**
 * started_at range to query for a calendar month. Sessions are placed by their own start
 * timezone, which can differ from the viewer's by up to 26 h, so the range is padded; filter
 * the rows with sessionsByDay().
 */
export function monthQueryRange(year: number, month: number): { from: number; to: number } {
  const pad = 27 * 3_600_000;
  return { from: Date.UTC(year, month - 1, 1) - pad, to: Date.UTC(year, month, 1) + pad };
}

/** Group counted sessions by calendar day within one month: 'YYYY-MM-DD' -> sessions (start order). */
export function sessionsByDay<T extends HistorySession>(
  sessions: T[],
  year: number,
  month: number,
): Map<string, T[]> {
  const prefix = `${year}-${pad(month)}-`;
  const out = new Map<string, T[]>();
  for (const s of [...sessions].sort((a, b) => a.started_at - b.started_at)) {
    if (!counted(s)) continue;
    const k = calendarDayKey(s);
    if (!k.startsWith(prefix)) continue;
    const list = out.get(k) ?? [];
    list.push(s);
    out.set(k, list);
  }
  return out;
}

/** Monday-first grid of local dates covering a month (leading/trailing days from neighbours). */
export function monthGrid(year: number, month: number): Array<{ key: string; inMonth: boolean }> {
  const lead = mondayIndex(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const out: Array<{ key: string; inMonth: boolean }> = [];
  for (let i = 0; i < cells; i++) {
    const t = shiftDate(year, month, 1, i - lead);
    out.push({ key: dateKey(t.y, t.m, t.d), inMonth: t.m === month && t.y === year });
  }
  return out;
}
