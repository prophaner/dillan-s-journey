// TV S12 Calendar (2-D day grid), S13 Session detail (read-only + "Edit on your phone" QR) and
// S15 Profile (Switch user / Lock this TV / remember my name / Remove my profile; M5, M6).
// Mockups tv-16..tv-18. Calendar rules are the phone's (calendar-page.tsx): Monday-first, nothing
// after the current month, future days inert, a session sits on its local start date.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { formatDuration } from "@/v1/core/timing";
import { dateKey, localParts, monthGrid } from "@/v1/core/week";
import { useMonth, useProfile, useSessionRow, useSummary } from "@/v1/data/queries";
import {
  counts,
  doneText,
  exercisesWithSteps,
  formatDay,
  formatDayKey,
  minutesText,
  prescribedText,
} from "@/v1/session/format";
import { useNow } from "@/v1/session/use-session";
import { groupByDay } from "@/v1/ui/calendar-page";
import { DETAIL_COPY } from "@/v1/ui/session-detail-page";
import { SUMMARY_COPY } from "@/v1/ui/summary-view";
import { ZONE_COPY } from "@/v1/ui/zone-pieces";
import { browserTimeZone, formatClock } from "@/v1/ui/timezones";
import { cn } from "@/lib/utils";
import { useTv } from "./context";
import { TvNavScreen } from "./screens-main";
import {
  loadView,
  TV_LOAD_COPY,
  TvAvatar,
  TvButton,
  TvDialog,
  TvEyebrow,
  TvHints,
  TvLoadError,
  TvPanel,
  TvQr,
  TvZoneBars,
} from "./ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TV_PROFILE_COPY = {
  managedOnPhone:
    "Units, weekly goal, live heart rate, zones, and contact methods are managed on your phone.",
  autoLock: "This TV locks itself after 15 minutes without activity, except during a workout.",
  switchUser: "Switch user",
  lock: "Lock this TV",
  remove: "Remove my profile",
  rememberOn: "Name shown on this TV: On",
  rememberOff: "Name shown on this TV: Off",
  rememberNeedsName: "To keep your name on this TV, first add your name in Profile on your phone.",
  rememberHelp:
    "When on, your first name stays on “Who's training?” (locked) after you leave. Nothing else is kept on the TV.",
  back: "Back",
  lockTitle: "Lock this TV?",
  lockBodyRemembered:
    "The TV returns to “Who's training?”. Your name stays on it, locked, until you remove it.",
  lockBodyNotRemembered: "The TV returns to “Who's training?”. Your name isn't kept on this TV.",
  lockConfirm: "Lock",
  removeTitle: (name: string) => `Remove ${name} from this TV?`,
  removeBody:
    "This TV signs you out and forgets your name. Your account and history are untouched.",
  removeConfirm: "Remove",
  cancel: "Cancel",
  runningTitle: "A workout is running",
  runningBody: "Ending saves everything so far. Cancel to go back to it.",
  runningConfirm: "End and save, then continue",
  editNotes: "Edit on your phone: scan to open this session there.",
  noNotes: "No notes. Add them from your phone.",
} as const;

/** The session note, read-only (notes are edited on the phone, handoff F7). */
export function TvNoteText({ sessionId, hideEmpty }: { sessionId: string; hideEmpty?: boolean }) {
  const tv = useTv();
  const q = useQuery({
    queryKey: ["v1", tv.user.id, "note", sessionId],
    queryFn: () => tv.api.notes.get(sessionId),
  });
  const text = q.data?.text.trim() ?? "";
  if (hideEmpty && !text) return null;
  return (
    <p className="line-clamp-4 whitespace-pre-wrap text-tv-sm text-text-2">
      {q.isLoading ? "…" : text || TV_PROFILE_COPY.noNotes}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// S12 Calendar

export function TvCalendar({
  month,
  day,
}: {
  month?: string | undefined;
  day?: string | undefined;
}) {
  const tv = useTv();
  const profile = useProfile(tv.user.id);
  const now = useNow(60_000);
  const tz = profile.data?.timezone ?? browserTimeZone();
  const today = localParts(now, tz);
  const todayKey = dateKey(today.y, today.m, today.d);
  const [y, m] = (month ?? day?.slice(0, 7) ?? `${today.y}-${String(today.m).padStart(2, "0")}`)
    .split("-")
    .map(Number) as [number, number];
  const isCurrent = y === today.y && m === today.m;
  const q = useMonth(tv.user.id, y, m);
  const byDay = useMemo(() => groupByDay(q.data ?? []), [q.data]);
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  const selected =
    day && day.startsWith(prefix)
      ? day
      : isCurrent
        ? todayKey
        : ([...byDay.keys()].pop() ?? `${prefix}-01`);
  const list = byDay.get(selected) ?? [];
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  const goMonth = (dm: number) => {
    const t = new Date(Date.UTC(y, m - 1 + dm, 1));
    tv.go({
      name: "calendar",
      month: `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  };
  const select = (k: string) => tv.go({ name: "calendar", month: prefix, day: k });

  return (
    <TvNavScreen
      screenKey="calendar"
      nav="calendar"
      hints={[
        ["◀ ▲ ▼ ▶", "Move between days"],
        ["OK", "Open day / session"],
        ["Back", "Home"],
      ]}
    >
      <div className="grid h-full grid-cols-[1.15fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <TvButton
              focusId="cal-prev"
              size="md"
              aria-label="Previous month"
              onPress={() => goMonth(-1)}
            >
              <ChevronLeft className="size-9" aria-hidden />
            </TvButton>
            <h1 className="text-tv-xl font-bold" aria-live="polite">
              {label}
            </h1>
            <TvButton
              focusId="cal-next"
              size="md"
              aria-label="Next month"
              disabled={isCurrent || y > today.y || (y === today.y && m > today.m)}
              onPress={() => goMonth(1)}
            >
              <ChevronRight className="size-9" aria-hidden />
            </TvButton>
          </div>
          <div className="grid grid-cols-7 gap-2" data-focus-list="calendar-days">
            {DOW.map((d) => (
              <span key={d} className="pb-1 text-center text-tv-xs font-bold uppercase text-text-2">
                {d}
              </span>
            ))}
            {monthGrid(y, m).map((c, i) => {
              if (!c.inMonth) return <span key={`pad-${i}`} aria-hidden />;
              const items = byDay.get(c.key) ?? [];
              const future = c.key > todayKey;
              const dayNum = Number(c.key.slice(8));
              const cls = cn(
                "flex h-[84px] flex-col items-center justify-center gap-1 rounded-tv-md text-tv-base",
                c.key === todayKey && "border-2 border-text-3",
                c.key === selected && "bg-surface-2",
                future ? "text-text-3" : "data-[focused]:bg-surface-2",
              );
              const marks = (
                <span className="flex h-3 items-center gap-1.5" aria-hidden>
                  {items.slice(0, 3).map((s) => (
                    <i
                      key={s.session_id}
                      className={cn(
                        "block size-3 rounded-full",
                        s.outcome === "completed" ? "bg-text" : "border-2 border-text",
                      )}
                    />
                  ))}
                  {items.some((s) => s.has_note) && <NotebookPen className="size-4" />}
                </span>
              );
              if (future)
                return (
                  <span key={c.key} className={cls}>
                    <span className="font-num tabular">{dayNum}</span>
                  </span>
                );
              return (
                <button
                  key={c.key}
                  type="button"
                  data-focus=""
                  data-focus-id={`day-${c.key}`}
                  {...(c.key === selected
                    ? // a day handed in (Back from a session) beats the remembered day
                      { "data-autofocus": day && day === selected ? "force" : "" }
                    : {})}
                  className={cls}
                  aria-label={`${formatDayKey(c.key)}${items.length ? `, ${items.length} session${items.length > 1 ? "s" : ""}` : ""}`}
                  onFocus={() => {
                    if (c.key !== selected) select(c.key);
                  }}
                  onClick={() => {
                    if (items.length === 1 && items[0])
                      tv.go({ name: "detail", sessionId: items[0].session_id, day: c.key });
                    else select(c.key);
                  }}
                >
                  <span className="font-num tabular">{dayNum}</span>
                  {marks}
                </button>
              );
            })}
          </div>
          <p className="text-tv-sm text-text-2">● completed · ○ ended early · past sessions only</p>
        </div>
        <TvPanel>
          <TvEyebrow>{formatDayKey(selected)}</TvEyebrow>
          {loadView(q) === "loading" ? (
            <p className="text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>
          ) : loadView(q) === "error" ? (
            <TvLoadError focusId="calendar-retry" onRetry={() => void q.refetch()} />
          ) : list.length ? (
            <ul
              className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3"
              data-focus-list="calendar-sessions"
            >
              {list.map((s) => (
                <li key={s.session_id}>
                  <button
                    type="button"
                    data-focus=""
                    data-focus-id={`cal-session-${s.session_id}`}
                    className="flex w-full items-center gap-6 rounded-tv-lg border-2 border-line bg-surface-2 px-6 py-5 text-left data-[focused]:border-text"
                    onClick={() =>
                      tv.go({ name: "detail", sessionId: s.session_id, day: s.local_date })
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-tv-md font-bold">{s.name}</span>
                      <span className="block text-tv-sm text-text-2">
                        {formatClock(s.started_at, s.start_timezone)} ·{" "}
                        {minutesText(Number(s.active_ms))} ·{" "}
                        {s.outcome === "completed" ? "Completed" : "Ended early"}
                        {s.hr_status === "no_live_data" ? " · No HR data" : ""}
                      </span>
                    </span>
                    {s.has_note && (
                      <NotebookPen className="size-8 text-text-2" aria-label="Has a note" />
                    )}
                    <ChevronRight className="size-9 text-text-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-tv-base text-text-2">
              {byDay.size || (q.data?.length ?? 0) > 0
                ? "No sessions on this day."
                : "Your saved workouts will appear here."}
            </p>
          )}
        </TvPanel>
      </div>
    </TvNavScreen>
  );
}

// ---------------------------------------------------------------------------------------------
// S13 Session detail (read-only)

export function TvDetail({ sessionId, day }: { sessionId: string; day?: string | undefined }) {
  const tv = useTv();
  const q = useSessionRow(tv.user.id, sessionId);
  const row = q.data;
  const ended = row?.state === "ended" && row.outcome !== "discarded";
  const summary = useSummary(tv.user.id, sessionId, !!ended);
  const s = summary.data;
  const back = () => tv.go({ name: "calendar", ...(day ? { day, month: day.slice(0, 7) } : {}) });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div data-screen={`detail:${sessionId}`} className="flex h-full flex-col">
      {!row || !ended ? (
        <div className="m-auto flex flex-col items-center gap-6">
          {loadView(q) === "error" ? (
            <TvLoadError focusId="detail-retry" autoFocus onRetry={() => void q.refetch()} />
          ) : (
            <p className="text-tv-lg text-text-2">
              {q.isPending ? TV_LOAD_COPY.loading : "Session not found"}
            </p>
          )}
          <TvButton focusId="detail-back" autoFocus={loadView(q) !== "error"} onPress={back}>
            Back to Calendar
          </TvButton>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-12">
          <div className="flex min-h-0 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={cn(
                  "rounded-chip px-5 py-1.5 text-tv-sm font-bold",
                  row.outcome === "completed"
                    ? "bg-steady-tint text-steady"
                    : "bg-surface-2 text-text-2",
                )}
              >
                {row.outcome === "completed"
                  ? SUMMARY_COPY.completed
                  : `${SUMMARY_COPY.endedEarly} · ${counts(row).done} of ${counts(row).total} sets`}
              </span>
              {!row.live_data && (
                <span className="rounded-chip bg-surface-2 px-5 py-1.5 text-tv-sm font-bold text-text-2">
                  No HR data
                </span>
              )}
              {row.started_at && row.ended_at && (
                <span className="text-tv-sm text-text-2">
                  {formatDay(row.started_at, row.start_timezone)} ·{" "}
                  {formatClock(row.started_at, row.start_timezone)}–
                  {formatClock(row.ended_at, row.start_timezone)}
                  {s ? ` · ${formatDuration(s.active_ms)} active` : ""}
                </span>
              )}
            </div>
            <h1 className="shrink-0 truncate text-tv-2xl font-bold">{row.snapshot.name}</h1>
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {exercisesWithSteps(row.snapshot, row.steps).map(
                ({ key, ex, block, steps, label }) => (
                  <li key={key} className="rounded-tv-md bg-surface px-6 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="truncate text-tv-base font-bold">
                        {label ? `${label} · ` : ""}
                        {ex.name}
                      </span>
                      <span className="shrink-0 text-tv-sm text-text-2">
                        {prescribedText(block, ex)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {steps.map((st) => {
                        const r = row.results[st.key];
                        return (
                          <span
                            key={st.key}
                            className={cn(
                              "rounded-chip px-4 py-1 text-tv-xs font-bold",
                              r?.status === "done"
                                ? "bg-steady-tint text-steady"
                                : "bg-surface-2 text-text-2",
                            )}
                          >
                            {r?.status === "done"
                              ? doneText(r, ex)
                              : r?.status === "skipped"
                                ? "Skipped"
                                : "Not reached"}
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ),
              )}
            </ul>
            <p className="text-tv-xs text-text-3">{DETAIL_COPY.snapshot}</p>
            <div className="flex">
              <TvButton focusId="detail-back" autoFocus onPress={back}>
                Back to Calendar
              </TvButton>
            </div>
          </div>
          <TvPanel className="gap-5 overflow-hidden">
            <TvEyebrow>Heart-rate zones</TvEyebrow>
            {!row.live_data ? (
              <p className="text-tv-base text-text-2">{ZONE_COPY.noLiveData}</p>
            ) : !s || s.hr_status === "pending" ? (
              <p className="text-tv-base text-text-2">{SUMMARY_COPY.finalizing}</p>
            ) : (
              <TvZoneBars
                compact
                zoneMs={s.zone_ms}
                unmeasuredMs={s.unmeasured_ms}
                cutoffs={row.zone_snapshot?.cutoffs ?? null}
              />
            )}
            <TvEyebrow className="mt-2">Notes</TvEyebrow>
            <TvNoteText sessionId={row.id} />
            <div className="flex items-center gap-6">
              <TvQr
                value={`${origin}/calendar/${row.id}`}
                label="QR code to open this session on your phone"
              />
              <p className="text-tv-sm text-text-2">{TV_PROFILE_COPY.editNotes}</p>
            </div>
          </TvPanel>
        </div>
      )}
      <TvHints items={[["Back", "Calendar"]]} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// S15 Profile (TV subset) with M4/M5/M6

export function TvProfile() {
  const tv = useTv();
  const profile = useProfile(tv.user.id);
  const name = profile.data?.display_name ?? "";
  const first = name.trim().split(/\s+/)[0] ?? "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <TvNavScreen screenKey="profile" nav={null} hints={[["Back", "Home"]]}>
      <div className="grid h-full grid-cols-2 gap-12">
        <div className="flex min-h-0 flex-col gap-6">
          <div className="flex items-center gap-8">
            <TvAvatar name={name} size={160} />
            <div className="min-w-0">
              <h1 className="shrink-0 truncate text-tv-2xl font-bold">{name}</h1>
              <p className="text-tv-base text-text-2">Signed in on {tv.device.label}</p>
            </div>
          </div>
          <p className="text-tv-base text-text-2">{TV_PROFILE_COPY.managedOnPhone}</p>
          <div className="flex flex-col gap-4 p-2">
            <TvButton focusId="profile-switch" autoFocus onPress={() => tv.requestSwitch()}>
              {TV_PROFILE_COPY.switchUser}
            </TvButton>
            <TvButton focusId="profile-lock" onPress={() => tv.requestLock()}>
              {TV_PROFILE_COPY.lock}
            </TvButton>
            <TvButton
              focusId="profile-remember"
              aria-pressed={tv.remembered}
              disabled={!tv.remembered && !tv.canRemember}
              onPress={() => tv.setRemembered(!tv.remembered)}
            >
              {tv.remembered ? TV_PROFILE_COPY.rememberOn : TV_PROFILE_COPY.rememberOff}
            </TvButton>
            <TvButton focusId="profile-remove" variant="ghost" onPress={() => tv.requestRemove()}>
              {TV_PROFILE_COPY.remove}
            </TvButton>
            <TvButton
              focusId="profile-back"
              variant="ghost"
              onPress={() => tv.go({ name: "home" })}
            >
              {TV_PROFILE_COPY.back}
            </TvButton>
          </div>
          <p className="text-tv-sm text-text-2">
            {!tv.remembered && !tv.canRemember
              ? profile.isPending
                ? TV_LOAD_COPY.loading
                : TV_PROFILE_COPY.rememberNeedsName
              : TV_PROFILE_COPY.rememberHelp}
          </p>
          <p className="text-tv-sm text-text-2">{TV_PROFILE_COPY.autoLock}</p>
        </div>
        <TvPanel className="items-center justify-center text-center">
          <TvQr value={`${origin}/profile`} label="QR code to open settings on your phone" />
          <p className="text-tv-md font-bold">Open settings on your phone</p>
        </TvPanel>
      </div>
      {tv.modal?.kind === "lock" && (
        <TvDialog
          id="lock"
          title={TV_PROFILE_COPY.lockTitle}
          actions={
            <>
              <TvButton focusId="lock-cancel" autoFocus onPress={() => tv.openModal(null)}>
                {TV_PROFILE_COPY.cancel}
              </TvButton>
              <TvButton focusId="lock-confirm" variant="danger" onPress={() => tv.lockNow()}>
                {TV_PROFILE_COPY.lockConfirm}
              </TvButton>
            </>
          }
        >
          {tv.remembered
            ? TV_PROFILE_COPY.lockBodyRemembered
            : TV_PROFILE_COPY.lockBodyNotRemembered}
        </TvDialog>
      )}
      {tv.modal?.kind === "remove" && (
        <TvDialog
          id="remove"
          title={TV_PROFILE_COPY.removeTitle(first || "your profile")}
          actions={
            <>
              <TvButton focusId="remove-cancel" autoFocus onPress={() => tv.openModal(null)}>
                {TV_PROFILE_COPY.cancel}
              </TvButton>
              <TvButton
                focusId="remove-confirm"
                variant="danger"
                onPress={() => tv.lockNow({ forget: true })}
              >
                {TV_PROFILE_COPY.removeConfirm}
              </TvButton>
            </>
          }
        >
          {TV_PROFILE_COPY.removeBody}
        </TvDialog>
      )}
    </TvNavScreen>
  );
}

/** M4, shown over any screen: Switch user / Lock / Remove while a workout is running. */
export function TvRunningDialog({ then }: { then: "switch" | "lock" | "remove" }) {
  const tv = useTv();
  return (
    <TvDialog
      id="running"
      title={TV_PROFILE_COPY.runningTitle}
      actions={
        <>
          <TvButton focusId="running-cancel" autoFocus onPress={() => tv.openModal(null)}>
            {TV_PROFILE_COPY.cancel}
          </TvButton>
          <TvButton focusId="running-end" variant="danger" onPress={() => tv.endRunningThen(then)}>
            {TV_PROFILE_COPY.runningConfirm}
          </TvButton>
        </>
      }
    >
      {TV_PROFILE_COPY.runningBody}
    </TvDialog>
  );
}
