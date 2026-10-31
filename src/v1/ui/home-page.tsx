// S04 Home (phone/desktop): Workout Now, the running-workout card, this week (Mon–Sun in the
// user's timezone) against the weekly goal, active minutes, "vs last week at this point" and the
// 4-week trend. Completed sessions count toward the goal and trend; ended-early sessions are shown
// separately with their minutes (D14). Math: src/v1/core/week.ts.

import { Link } from "@tanstack/react-router";
import { ChevronRight, Play, NotebookPen } from "lucide-react";
import {
  activeMinutes,
  weekMetrics,
  weekTrend,
  type HistorySession,
  type WeekMetrics,
  type TrendWeek,
} from "@/v1/core/week";
import type { HistoryItem } from "@/v1/data/api";
import { useHistory, useProfile, useTemplates } from "@/v1/data/queries";
import { formatDay, minutesText } from "@/v1/session/format";
import { useNow } from "@/v1/session/use-session";
import { formatClock } from "./timezones";
import { useUser } from "./user-context";
import { RunningBanner } from "./running-banner";
import { AvatarLink, ScreenHeader } from "@/components/dillan/app-shell";
import { dButton } from "@/components/dillan/button";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";

export const HOME_COPY = {
  workoutNow: "Workout Now",
  week: "This week · Mon–Sun",
  goalEditable: "Goal is editable in Profile",
  activeMinutes: "Active minutes",
  vsLastWeek: "vs last week at this point",
  trend: "Sessions per week · last 4",
  emptyTitle: "Your first workout starts your progress.",
  emptyBody: "Weekly sessions and active minutes will show here.",
  createFirst: "Create your first workout",
  recent: "Most recent",
} as const;

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toHistory(items: HistoryItem[]): HistorySession[] {
  return items.map((h) => ({
    id: h.session_id,
    started_at: Date.parse(h.started_at),
    active_ms: Number(h.active_ms),
    outcome: h.outcome,
    start_timezone: h.start_timezone,
  }));
}

export function compareLine(m: WeekMetrics): string {
  const d = m.completed - m.prevSame.completed;
  if (d === 0) return "Same as this point last week";
  return d > 0 ? `${d} more than this point last week` : `${-d} fewer than this point last week`;
}

export function HomePage() {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  const templates = useTemplates(user.id);
  const history = useHistory(user.id);
  const now = useNow(60_000);
  const name = profile?.display_name ?? "";
  const tz = profile?.timezone ?? "UTC";
  const goal = profile?.weekly_goal ?? 3;

  return (
    <>
      <ScreenHeader big title={name ? `Hi, ${name}` : "Hi"} trailing={<AvatarLink name={name} />} />
      <RunningBanner className="mb-3" />
      <Link
        to="/workout"
        className={cn(dButton({ variant: "primary", size: "lg" }), "h-16 text-title3")}
      >
        <Play className="size-5 fill-current" aria-hidden />
        {HOME_COPY.workoutNow}
      </Link>
      {history.isLoading || !profile ? (
        <ScreenState kind="loading" />
      ) : history.isError ? (
        <ScreenState
          kind="failed"
          title="Couldn't load your progress"
          body="Check your connection."
          action={{ label: "Try again", onClick: () => void history.refetch() }}
        />
      ) : (
        <Progress
          items={history.data ?? []}
          now={now}
          tz={tz}
          goal={goal}
          hasTemplates={(templates.data?.length ?? 0) > 0}
        />
      )}
    </>
  );
}

export function Progress({
  items,
  now,
  tz,
  goal,
  hasTemplates,
}: {
  items: HistoryItem[];
  now: number;
  tz: string;
  goal: number;
  hasTemplates: boolean;
}) {
  const sessions = toHistory(items);
  if (sessions.length === 0)
    return (
      <Card className="mt-4">
        <Eyebrow>{HOME_COPY.week}</Eyebrow>
        <div className="flex flex-col items-center py-6 text-center">
          <SpotMark size={40} className="text-text" />
          <p className="mt-3 text-headline font-bold">{HOME_COPY.emptyTitle}</p>
          <p className="mt-1 text-subhead text-text-2">{HOME_COPY.emptyBody}</p>
          {!hasTemplates && (
            <Link
              to="/program/new"
              className={cn(dButton({ variant: "secondary", size: "md" }), "mt-5")}
            >
              {HOME_COPY.createFirst}
            </Link>
          )}
        </div>
      </Card>
    );

  const m = weekMetrics(sessions, now, tz, goal);
  const trend = weekTrend(sessions, now, tz, 4);
  const dow = DOW[(new Date(now).getUTCDay() + 6) % 7] ?? "";
  const localDow = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(now);
    } catch {
      return dow;
    }
  })();
  const recent = items[0];

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Card>
        <Eyebrow>{HOME_COPY.week}</Eyebrow>
        <div className="mt-3 flex items-center gap-4">
          <GoalRing done={m.completed} goal={goal} />
          <div className="min-w-0">
            <p className="text-headline font-bold" data-testid="week-count">
              {m.completed} of {goal} sessions
              {m.partial > 0 && (
                <span className="font-medium text-text-2"> · +{m.partial} ended early</span>
              )}
            </p>
            <p className="text-subhead text-text-2">{compareLine(m)}</p>
            <p className="text-subhead text-text-2">{HOME_COPY.goalEditable}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p
              className="font-num text-num-m font-extrabold tabular leading-none"
              data-testid="week-minutes"
            >
              {activeMinutes(m.activeMs)}
            </p>
            <p className="mt-1 text-footnote font-bold uppercase tracking-wider text-text-2">
              {HOME_COPY.activeMinutes}
            </p>
            {m.partial > 0 && (
              <p className="mt-1 text-footnote text-text-2">
                Includes {activeMinutes(m.partialActiveMs)} min from ended-early sessions
              </p>
            )}
          </div>
          <div className="min-w-0 text-right">
            <p className="font-num text-num-m font-extrabold tabular leading-none text-text-2">
              {activeMinutes(m.prevSame.activeMs)}
            </p>
            <p className="mt-1 text-footnote font-bold uppercase tracking-wider text-text-2">
              {HOME_COPY.vsLastWeek}
            </p>
            <p className="mt-1 text-footnote text-text-2">{m.prevSame.completed} completed then</p>
          </div>
        </div>
        <TrendBars weeks={trend} goal={goal} />
        <p className="mt-2 text-footnote text-text-2">
          Current week is in progress ({localDow}). Earlier weeks are complete.
        </p>
      </Card>
      {recent && (
        <Link
          to="/calendar/$sessionId"
          params={{ sessionId: recent.session_id }}
          className="press flex items-center gap-3 rounded-card border border-line bg-surface p-4"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-footnote font-bold uppercase tracking-wider text-text-2">
              {HOME_COPY.recent}
            </span>
            <span className="mt-0.5 block break-words text-headline font-bold">{recent.name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-subhead text-text-2">
              {formatDay(recent.started_at, recent.start_timezone, false)} ·{" "}
              {formatClock(recent.started_at, recent.start_timezone)} ·{" "}
              {minutesText(Number(recent.active_ms))} ·{" "}
              {recent.outcome === "completed" ? "Completed" : "Ended early"}
              {recent.has_note && <NotebookPen className="ml-1 size-4" aria-label="Has a note" />}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, goal > 0 ? done / goal : 0);
  return (
    <div className="relative size-20 shrink-0" aria-hidden>
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-surface-2" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-spot"
          strokeDasharray={`${frac * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-num text-headline font-bold tabular">
        {done}/{goal}
      </span>
    </div>
  );
}

function TrendBars({ weeks, goal }: { weeks: TrendWeek[]; goal: number }) {
  const max = Math.max(goal, ...weeks.map((w) => w.completed), 1);
  return (
    <div className="mt-5">
      <Eyebrow>{HOME_COPY.trend}</Eyebrow>
      <ol className="mt-3 grid h-28 grid-cols-4 items-end gap-3" aria-label={HOME_COPY.trend}>
        {weeks.map((w) => (
          <li
            key={w.startKey}
            className="flex h-full flex-col items-center justify-end gap-1"
            aria-label={`Week of ${w.startKey}: ${w.completed} completed${w.partial ? `, ${w.partial} ended early` : ""}${w.current ? " (this week)" : ""}`}
          >
            <span
              className={cn(
                "w-full max-w-14 rounded-t-btn",
                w.current ? "bg-spot" : "bg-surface-2",
              )}
              style={{ height: `${Math.max(6, (w.completed / max) * 80)}px` }}
            />
            <span className="font-num text-subhead tabular text-text-2">
              {w.completed}
              {w.partial > 0 && <span className="text-footnote"> +{w.partial}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
