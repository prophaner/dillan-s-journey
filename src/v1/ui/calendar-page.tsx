// S12 Calendar (phone/desktop): Monday-first month grid, earlier months navigable, nothing after
// the current month, future days plain and inert (acceptance 31). A session sits on its local
// start date in its own start timezone (session_summaries.local_date). Solid dot = completed,
// hollow = ended early (acceptance 32), pencil = has a note. Several sessions per day are listed
// for the selected day.

import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { localParts, monthGrid, dateKey } from "@/v1/core/week";
import type { HistoryItem } from "@/v1/data/api";
import { useMonth, useProfile } from "@/v1/data/queries";
import { formatDayKey, minutesText } from "@/v1/session/format";
import { useNow } from "@/v1/session/use-session";
import { formatClock } from "./timezones";
import { useUser } from "./user-context";
import { RunningBanner } from "./running-banner";
import { AvatarLink, ScreenHeader } from "@/components/dillan/app-shell";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";

export const CALENDAR_COPY = {
  title: "Calendar",
  legend:
    "● completed · ○ ended early · ✎ note. Only past sessions appear; there is no scheduling.",
  emptyDay: "No sessions on this day.",
  emptyAll: "Your saved workouts will appear here.",
  prev: "Previous month",
  next: "Next month",
} as const;

export interface CalendarSearch {
  month?: string;
  day?: string;
}

export function parseCalendarSearch(s: Record<string, unknown>): CalendarSearch {
  const out: CalendarSearch = {};
  const month = s["month"];
  const day = s["day"];
  if (typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) out.month = month;
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) out.day = day;
  return out;
}

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function groupByDay(items: HistoryItem[]): Map<string, HistoryItem[]> {
  const m = new Map<string, HistoryItem[]>();
  for (const s of [...items].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const l = m.get(s.local_date) ?? [];
    l.push(s);
    m.set(s.local_date, l);
  }
  return m;
}

export function CalendarPage({
  month,
  day,
}: {
  month?: string | undefined;
  day?: string | undefined;
}) {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  const now = useNow(60_000);
  const navigate = useNavigate();
  const tz = profile?.timezone ?? "UTC";
  const today = localParts(now, tz);
  const todayKey = dateKey(today.y, today.m, today.d);
  const fromDay = day ? day.slice(0, 7) : undefined;
  const [y, m] = (month ?? fromDay ?? `${today.y}-${String(today.m).padStart(2, "0")}`)
    .split("-")
    .map(Number) as [number, number];
  const isCurrent = y === today.y && m === today.m;
  const isFuture = y > today.y || (y === today.y && m > today.m);
  const q = useMonth(user.id, y, m);
  const byDay = groupByDay(q.data ?? []);
  const selected =
    day && day.startsWith(`${y}-${String(m).padStart(2, "0")}`)
      ? day
      : isCurrent
        ? todayKey
        : ([...byDay.keys()].pop() ?? null);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));

  const go = (dy: number, dm: number, d?: string) => {
    const t = new Date(Date.UTC(dy, dm - 1, 1));
    const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    void navigate({ to: "/calendar", search: { month: key, ...(d ? { day: d } : {}) } });
  };

  const list = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <>
      <ScreenHeader
        big
        title={CALENDAR_COPY.title}
        trailing={<AvatarLink name={profile?.display_name ?? ""} />}
      />
      <RunningBanner className="mb-3" />
      <Card className="px-3 sm:px-[18px]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={CALENDAR_COPY.prev}
            className="press grid size-11 place-items-center rounded-full"
            onClick={() => go(y, m - 1)}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <h2 className="text-headline font-bold" aria-live="polite">
            {label}
          </h2>
          <button
            type="button"
            aria-label={CALENDAR_COPY.next}
            className="press grid size-11 place-items-center rounded-full disabled:text-text-3"
            disabled={isCurrent || isFuture}
            onClick={() => go(y, m + 1)}
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </div>
        <div role="grid" aria-label={label} className="mt-2">
          <div role="row" className="grid grid-cols-7">
            {DOW.map((d, i) => (
              <span
                key={i}
                role="columnheader"
                aria-label={DOW_LONG[i]}
                className="py-1 text-center text-footnote font-bold text-text-2"
              >
                {d}
              </span>
            ))}
          </div>
          {chunk(monthGrid(y, m), 7).map((week, wi) => (
            <div role="row" key={wi} className="grid grid-cols-7">
              {week.map((c) => {
                if (!c.inMonth) return <span key={c.key} role="gridcell" className="h-12" />;
                const d = Number(c.key.slice(8));
                const sessions = byDay.get(c.key) ?? [];
                const future = c.key > todayKey;
                const isToday = c.key === todayKey;
                const sel = c.key === selected;
                const marks = (
                  <span className="flex h-2.5 items-center gap-0.5" aria-hidden>
                    {sessions.slice(0, 3).map((s) => (
                      <i
                        key={s.session_id}
                        data-mark={s.outcome === "completed" ? "completed" : "ended-early"}
                        className={cn(
                          "block size-1.5 rounded-full",
                          s.outcome === "completed"
                            ? "bg-spot"
                            : "border-[1.5px] border-spot bg-transparent",
                        )}
                      />
                    ))}
                    {sessions.some((s) => s.has_note) && (
                      <NotebookPen data-mark="note" className="size-2.5 text-text-2" />
                    )}
                  </span>
                );
                const name = `${formatDayKey(c.key)}${
                  sessions.length
                    ? `, ${sessions.length} session${sessions.length > 1 ? "s" : ""}`
                    : ""
                }${sessions.some((s) => s.has_note) ? ", has a note" : ""}`;
                if (future)
                  return (
                    <span
                      key={c.key}
                      role="gridcell"
                      aria-disabled="true"
                      className="flex h-12 flex-col items-center justify-center text-subhead text-text-3"
                    >
                      {d}
                    </span>
                  );
                return (
                  <span
                    key={c.key}
                    role="gridcell"
                    className="flex h-12 items-center justify-center"
                  >
                    <button
                      type="button"
                      aria-label={name}
                      aria-pressed={sel}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => go(y, m, c.key)}
                      className={cn(
                        "flex h-12 w-full max-w-11 flex-col items-center justify-center gap-0.5 rounded-btn font-num text-subhead tabular",
                        sel && "border-[1.5px] border-text",
                        isToday && "font-bold underline underline-offset-4",
                      )}
                    >
                      {d}
                      {marks}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-footnote text-text-2">{CALENDAR_COPY.legend}</p>
      </Card>

      <section className="mt-5" aria-live="polite">
        <Eyebrow>{selected ? formatDayKey(selected) : "Select a day"}</Eyebrow>
        {q.isLoading ? (
          <ScreenState kind="loading" />
        ) : q.isError ? (
          <ScreenState
            kind="failed"
            title="Couldn't load this month"
            body="Check your connection."
            action={{ label: "Try again", onClick: () => void q.refetch() }}
          />
        ) : list.length ? (
          <ul className="mt-3 flex flex-col gap-3">
            {list.map((s) => (
              <li key={s.session_id}>
                <Link
                  to="/calendar/$sessionId"
                  params={{ sessionId: s.session_id }}
                  className="press flex items-center gap-3 rounded-card border border-line bg-surface p-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-headline font-bold">{s.name}</span>
                    <span className="mt-0.5 block text-subhead text-text-2">
                      {formatClock(s.started_at, s.start_timezone)} ·{" "}
                      {minutesText(Number(s.active_ms))} ·{" "}
                      {s.outcome === "completed" ? "Completed" : "Ended early"}
                      {s.hr_status === "no_live_data" ? " · No HR data" : ""}
                    </span>
                  </span>
                  {s.has_note && (
                    <span
                      className="grid h-9 w-11 shrink-0 place-items-center rounded-chip bg-surface-2"
                      aria-label="Has a note"
                    >
                      <NotebookPen className="size-4" aria-hidden />
                    </span>
                  )}
                  <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-subhead text-text-2">
            {byDay.size || isCurrent ? CALENDAR_COPY.emptyDay : CALENDAR_COPY.emptyAll}
          </p>
        )}
      </section>
    </>
  );
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
