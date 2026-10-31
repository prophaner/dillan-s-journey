// TV S04 Home, S05 Program (read-only + "Edit on your phone"), S07 Choose, S08 Preflight
// (handoff §3 focus order / initial focus; mockups tv-05..tv-08, tv-19). Templates are never edited
// on the TV: the remote isn't a keyboard, and a paired TV session may not write templates (0006).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Play } from "lucide-react";
import { activeMinutes, weekMetrics, weekTrend } from "@/v1/core/week";
import { activeMs, formatDuration } from "@/v1/core/timing";
import { engineStateFromRow, type Block, type WorkoutTemplate } from "@/v1/core/types";
import { newId } from "@/v1/data/api";
import {
  qk,
  useCurrentSession,
  useHistory,
  useProfile,
  useTemplates,
  useZones,
} from "@/v1/data/queries";
import { formatDay, loadText, minutesText, repsText } from "@/v1/session/format";
import { sourceLine } from "@/v1/core/health";
import {
  HOME_HR_COPY,
  homeHrCard,
  PREFLIGHT_HR_COPY,
  preflightChip,
  preflightKindMismatch,
  preflightReady,
} from "@/v1/core/hr-views";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { compareLine, HOME_COPY, toHistory } from "@/v1/ui/home-page";
import { PREFLIGHT_COPY } from "@/v1/ui/preflight-page";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";
import { useTv } from "./context";
import { TV_HR_COPY, TvRelayQrDialog, useHrStateToast } from "./hr-pieces";
import type { TvScreen } from "./screens";
import {
  loadView,
  TV_LOAD_COPY,
  TvButton,
  TvCard,
  TvEyebrow,
  TvHints,
  TvLoadError,
  TvPanel,
  TvQr,
  TvTopBar,
  type NavKey,
} from "./ui";

export const TV_MAIN_COPY = {
  backToWorkout: "Back to workout",
  workoutRunning: "Workout in progress",
  switchUser: "Switch user",
  programTitle: "Program",
  noWorkouts: "No workouts yet",
  noWorkoutsBody:
    "Workouts are built on your phone — the remote isn't a good keyboard. Scan to create your first one.",
  editOnPhone: "Edit on your phone",
  editOnPhoneBody: "Scan to open Program on your phone. Changes appear here as soon as you save.",
  chooseTitle: "Choose a workout",
  chooseSub: "Nothing starts until you press Start on the next screen.",
  createFirst: "Create your first workout",
  createFirstBody:
    "Workout Now needs a saved workout to follow. It takes about two minutes to build one.",
  scanProgram: "Scan to open Program on your phone",
  startWorkout: "Start workout",
  back: "Back",
  backHome: "Back to Home",
  ready: "Ready?",
  liveDataPhone: "Finish setup on your phone: Profile → Live data.",
  zonesHelp:
    "Zones are five BPM ranges you define. Until you confirm them, Dillan shows BPM only and never guesses a zone.",
} as const;

/** Chrome for nav screens: top bar, content, footer hints. */
export function TvNavScreen({
  screenKey,
  nav,
  children,
  hints,
}: {
  screenKey: string;
  nav: NavKey | null;
  children: ReactNode;
  hints: Array<[string, string]>;
}) {
  const tv = useTv();
  const profile = useProfile(tv.user.id);
  const go = (k: NavKey) => tv.go({ name: k } as TvScreen);
  return (
    <div data-screen={screenKey} className="relative flex h-full flex-col">
      <TvTopBar
        current={nav}
        name={profile.data?.display_name ?? ""}
        running={!!tv.liveSessionId}
        onNav={go}
        onProfile={() => tv.go({ name: "profile" })}
      />
      <div className="min-h-0 flex-1">{children}</div>
      <TvHints items={hints} />
    </div>
  );
}

export function TvChip({ label, tone }: { label: string; tone: "live" | "warn" | "off" }) {
  return (
    <span
      className={cn(
        "inline-flex h-12 shrink-0 items-center gap-3 rounded-chip px-5 text-tv-sm font-bold",
        tone === "live" && "bg-steady-tint text-steady",
        tone === "warn" && "bg-hold-tint text-hold",
        tone === "off" && "bg-surface-2 text-text-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-3 rounded-full",
          tone === "live" ? "bg-steady" : tone === "warn" ? "bg-hold" : "border-2 border-text-3",
        )}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// S04 Home

export function TvHome() {
  const tv = useTv();
  const uid = tv.user.id;
  const profile = useProfile(uid);
  const history = useHistory(uid);
  const current = useCurrentSession(uid);
  const zones = useZones(uid);
  const hr = useLiveHeartRate(uid, { zonesConfirmed: !!zones.data?.confirmed_at });
  const now = hr.now;
  const name = profile.data?.display_name ?? "";
  const tz = profile.data?.timezone ?? "UTC";
  const goal = profile.data?.weekly_goal ?? 3;
  const row = current.data;
  const live = row && (row.state === "active" || row.state === "paused") ? row : null;
  const health = hr.health;
  // Before the first successful read nothing is known: never "Not set up" (H0) by default.
  const hrLoaded = hr.loaded;
  const hrCard = homeHrCard(health, hr.live, hr.sensorRow);
  const host = typeof window !== "undefined" ? window.location.host : "";
  const items = history.data ?? [];
  const sessions = toHistory(items);
  const recent = items[0];
  const historyView = loadView(history);
  const openLive = () => live && tv.go({ name: "session", sessionId: live.id });

  return (
    <TvNavScreen
      screenKey="home"
      nav="home"
      hints={[
        ["◀ ▶", "Move"],
        ["OK", "Select"],
        ["Back", live ? "Back to workout" : "Exit app (stays signed in)"],
      ]}
    >
      <div className="grid h-full grid-cols-[1.3fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-6">
          <h1 className="shrink-0 truncate text-tv-3xl font-bold leading-tight">
            {live ? TV_MAIN_COPY.workoutRunning : name ? `Hi, ${name}` : "Hi"}
          </h1>
          {live && (
            <p className="text-tv-md text-text-2">
              {live.snapshot.name} · {live.state === "paused" ? "Paused" : "Running"} ·{" "}
              {formatDuration(activeMs(engineStateFromRow(live), now))} active
            </p>
          )}
          <div className="flex gap-6">
            {live && (
              <TvButton
                focusId="back-to-workout"
                autoFocus
                variant="primary"
                size="xl"
                className="flex-1"
                onPress={openLive}
              >
                {TV_MAIN_COPY.backToWorkout}
              </TvButton>
            )}
            <TvButton
              focusId="workout-now"
              autoFocus={!live}
              variant={live ? "secondary" : "primary"}
              size="xl"
              className="flex-1"
              icon={<Play className="size-9 fill-current" aria-hidden />}
              onPress={() => (live ? openLive() : tv.go({ name: "choose" }))}
            >
              {HOME_COPY.workoutNow}
            </TvButton>
          </div>
          {/* Focusable: OK shows the relay QR full screen, Back closes it (h10-design 6 S04). */}
          <button
            type="button"
            data-focus=""
            data-focus-id="hr-card"
            className="flex shrink-0 items-center gap-8 rounded-tv-lg border-2 border-line bg-surface px-8 py-4 text-left data-[focused]:border-text"
            onClick={() => tv.openModal({ kind: "relay_qr" })}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="flex items-center justify-between gap-4">
                <TvEyebrow>{HOME_HR_COPY.eyebrow}</TvEyebrow>
                <span className="flex items-center gap-3">
                  {hrLoaded && health.demo && (
                    <span className="rounded-chip border-2 border-text px-3 text-tv-xs font-bold">
                      DEMO
                    </span>
                  )}
                  {hrLoaded && <TvChip {...hrCard.chip} />}
                </span>
              </span>
              {/* TV: H1/H6 says where to open the relay, next to the QR (h10-design 6 S04). */}
              <span className="line-clamp-2 text-tv-base text-text-2">
                {!hrLoaded
                  ? hr.error
                    ? PREFLIGHT_HR_COPY.readFailed
                    : PREFLIGHT_HR_COPY.checking
                  : hrCard.showRelayQr
                    ? HOME_HR_COPY.tvOpenRelay(host, hr.live?.holder_name ?? "your relay device")
                    : hrCard.text}
              </span>
              {hrLoaded && hrCard.battery && (
                <span className="text-tv-sm font-bold text-hold">{hrCard.battery}</span>
              )}
              {!hrLoaded ? null : hrCard.notSetUp ? (
                <span className="text-tv-sm text-text-3">{HOME_HR_COPY.tvFallback}</span>
              ) : hrCard.showRelayQr ? null : (
                zones.data &&
                !zones.data.confirmed_at && (
                  <span className="text-tv-sm text-text-3">{TV_MAIN_COPY.zonesHelp}</span>
                )
              )}
            </span>
            {hrLoaded && hrCard.showRelayQr && (
              <TvQr
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/relay`}
                label={`QR code for ${host}/relay`}
                className="size-40"
              />
            )}
          </button>
          {recent && (
            <button
              type="button"
              data-focus=""
              data-focus-id="recent"
              className="flex items-center gap-6 rounded-tv-lg border-2 border-line bg-surface p-8 text-left data-[focused]:border-text data-[focused]:bg-surface-2"
              onClick={() =>
                tv.go({ name: "detail", sessionId: recent.session_id, day: recent.local_date })
              }
            >
              <span className="min-w-0 flex-1">
                <TvEyebrow>{HOME_COPY.recent}</TvEyebrow>
                <span className="mt-1 block truncate text-tv-lg font-bold">{recent.name}</span>
                <span className="block text-tv-base text-text-2">
                  {formatDay(recent.started_at, recent.start_timezone, false)} ·{" "}
                  {minutesText(Number(recent.active_ms))} ·{" "}
                  {recent.outcome === "completed" ? "Completed" : "Ended early"}
                  {recent.has_note ? " · has notes" : ""}
                </span>
              </span>
              <ChevronRight className="size-10 text-text-2" aria-hidden />
            </button>
          )}
          <div className="mt-auto">
            <TvButton
              focusId="home-switch"
              variant="ghost"
              size="md"
              onPress={() => tv.requestSwitch()}
            >
              {TV_MAIN_COPY.switchUser}
            </TvButton>
          </div>
        </div>
        <TvPanel>
          <TvEyebrow>{HOME_COPY.week}</TvEyebrow>
          {historyView === "loading" ? (
            <p className="text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>
          ) : historyView === "error" ? (
            <TvLoadError focusId="home-retry" onRetry={() => void history.refetch()} />
          ) : sessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
              <SpotMark size={88} className="text-text" />
              <p className="text-tv-lg font-bold">{HOME_COPY.emptyTitle}</p>
              <p className="text-tv-base text-text-2">{HOME_COPY.emptyBody}</p>
            </div>
          ) : (
            <WeekPanel sessions={sessions} now={now} tz={tz} goal={goal} />
          )}
        </TvPanel>
      </div>
      {tv.modal?.kind === "relay_qr" && <TvRelayQrDialog />}
    </TvNavScreen>
  );
}

function WeekPanel({
  sessions,
  now,
  tz,
  goal,
}: {
  sessions: ReturnType<typeof toHistory>;
  now: number;
  tz: string;
  goal: number;
}) {
  const m = weekMetrics(sessions, now, tz, goal);
  const trend = weekTrend(sessions, now, tz, 4);
  const max = Math.max(goal, ...trend.map((w) => w.completed), 1);
  return (
    <>
      <div>
        <p className="font-num text-tv-3xl font-extrabold leading-none tabular">
          {m.completed} <span className="text-tv-xl text-text-2">of {goal}</span>
        </p>
        <p className="mt-2 text-tv-sm font-bold uppercase tracking-[0.1em] text-text-2">
          Sessions · goal set on phone
          {m.partial > 0 ? ` · +${m.partial} ended early` : ""}
        </p>
        <p className="mt-1 text-tv-sm text-text-2">{compareLine(m)}</p>
      </div>
      <div>
        <p className="font-num text-tv-2xl font-extrabold leading-none tabular">
          {activeMinutes(m.activeMs)}{" "}
          <span className="text-tv-sm font-bold uppercase text-text-2">min</span>
        </p>
        <p className="mt-2 text-tv-sm font-bold uppercase tracking-[0.1em] text-text-2">
          {HOME_COPY.activeMinutes} · {activeMinutes(m.prevSame.activeMs)} by this point last week
        </p>
      </div>
      <div>
        <TvEyebrow>{HOME_COPY.trend}</TvEyebrow>
        <ol className="mt-4 grid h-40 grid-cols-4 items-end gap-6" aria-label={HOME_COPY.trend}>
          {trend.map((w) => (
            <li key={w.startKey} className="flex h-full flex-col items-center justify-end gap-2">
              <span
                className={cn(
                  "w-full max-w-24 rounded-t-tv-sm",
                  w.current ? "bg-spot" : "bg-surface-2",
                )}
                style={{ height: `${Math.max(8, (w.completed / max) * 110)}px` }}
              />
              <span className="font-num text-tv-sm tabular text-text-2">
                {w.completed}
                {w.current ? " · now" : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// S05 Program

function exerciseNames(blocks: Block[]): string {
  return blocks
    .flatMap((b) => (b.type === "straight" ? [b.exercise.name] : b.exercises.map((e) => e.name)))
    .join(", ");
}

function setCount(blocks: Block[]): number {
  return blocks.reduce(
    (n, b) => n + (b.type === "straight" ? b.sets : b.rounds * b.exercises.length),
    0,
  );
}

function exerciseCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.type === "straight" ? 1 : b.exercises.length), 0);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const ROW =
  "flex w-full items-center gap-6 rounded-tv-lg border-2 border-line bg-surface px-8 py-6 text-left data-[focused]:border-text data-[focused]:bg-surface-2";

export function TvProgram() {
  const tv = useTv();
  const templates = useTemplates(tv.user.id);
  const list = templates.data ?? [];
  const view = loadView(templates);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <TvNavScreen
      screenKey="program"
      nav="program"
      hints={[
        ["OK", "Preview & start"],
        ["Back", "Home"],
      ]}
    >
      <div className="grid h-full grid-cols-[2fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-6">
          <h1 className="text-tv-xl font-bold">{TV_MAIN_COPY.programTitle}</h1>
          {view === "loading" ? (
            <p className="text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>
          ) : view === "error" ? (
            <TvLoadError
              focusId="program-retry"
              autoFocus
              onRetry={() => void templates.refetch()}
            />
          ) : list.length === 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-tv-lg font-bold">{TV_MAIN_COPY.noWorkouts}</h2>
              <p className="text-tv-base text-text-2">{TV_MAIN_COPY.noWorkoutsBody}</p>
            </div>
          ) : (
            <ul
              className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3"
              data-focus-list="program"
            >
              {list.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    data-focus=""
                    data-focus-id={`program-${t.id}`}
                    {...(i === 0 ? { "data-autofocus": "" } : {})}
                    className={ROW}
                    onClick={() => tv.go({ name: "preflight", templateId: t.id })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-tv-md font-bold">{t.name}</span>
                      <span className="block truncate text-tv-sm text-text-2">
                        {plural(exerciseCount(t.blocks), "exercise")} ·{" "}
                        {plural(setCount(t.blocks), "set")} · {exerciseNames(t.blocks)}
                      </span>
                    </span>
                    <ChevronRight className="size-9 text-text-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          data-focus=""
          data-focus-id="edit-on-phone"
          {...(view === "ready" && list.length === 0 ? { "data-autofocus": "" } : {})}
          className="flex flex-col items-center gap-8 rounded-tv-lg border-2 border-line bg-surface p-12 text-center data-[focused]:border-text"
          onClick={() => tv.toast(TV_MAIN_COPY.editOnPhoneBody)}
        >
          <TvQr value={`${origin}/program`} label="QR code to open Program on your phone" />
          <span className="text-tv-md font-bold">{TV_MAIN_COPY.editOnPhone}</span>
          <span className="text-tv-base text-text-2">{TV_MAIN_COPY.editOnPhoneBody}</span>
        </button>
      </div>
    </TvNavScreen>
  );
}

// ---------------------------------------------------------------------------------------------
// S07 Choose

function BlockPreview({ blocks }: { blocks: Block[] }) {
  let letter = 0;
  return (
    <ul className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.type === "straight") {
          const e = b.exercise;
          return (
            <li key={i} className="rounded-tv-md bg-surface-2 px-6 py-4">
              <p className="truncate text-tv-base font-bold">{e.name}</p>
              <p className="truncate text-tv-sm text-text-2">
                {b.sets} × {repsText(e.reps, e.rep_mode)} ·{" "}
                {loadText(e.weight, e.unit, e.load_basis)} · rest {b.rest_s}s
              </p>
            </li>
          );
        }
        const l = String.fromCharCode(65 + letter++);
        return (
          <li key={i} className="rounded-tv-md bg-surface-2 px-6 py-4">
            <TvEyebrow>
              Superset {l} · {b.rounds} rounds
            </TvEyebrow>
            {b.exercises.map((e, mi) => (
              <p key={mi} className="truncate text-tv-base">
                {l}
                {mi + 1} · {e.name}{" "}
                <span className="text-text-2">
                  {repsText(e.reps, e.rep_mode)} · {loadText(e.weight, e.unit, e.load_basis)}
                </span>
              </p>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

export function TvChoose() {
  const tv = useTv();
  const templates = useTemplates(tv.user.id);
  const history = useHistory(tv.user.id);
  const list = useMemo(() => templates.data ?? [], [templates.data]);
  const lastUsed = useMemo(() => {
    const ids = new Set(list.map((t) => t.id));
    return (history.data ?? []).find((h) => h.template_id && ids.has(h.template_id))?.template_id;
  }, [history.data, list]);
  const initial = lastUsed ?? list[0]?.id ?? null;
  const [sel, setSel] = useState<string | null>(null);
  const shown: WorkoutTemplate | undefined = list.find((t) => t.id === (sel ?? initial));
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const view = loadView(templates);
  if (view === "ready" && list.length === 0)
    return (
      <TvNavScreen screenKey="choose:empty" nav={null} hints={[["Back", "Home"]]}>
        <div className="grid h-full grid-cols-[2fr_1fr] items-center gap-12">
          <div className="flex flex-col gap-6">
            <h1 className="text-tv-2xl font-bold">{TV_MAIN_COPY.createFirst}</h1>
            <p className="text-tv-md text-text-2">{TV_MAIN_COPY.createFirstBody}</p>
            <TvButton focusId="choose-back" autoFocus onPress={() => tv.go({ name: "home" })}>
              {TV_MAIN_COPY.backHome}
            </TvButton>
          </div>
          <TvPanel className="items-center text-center">
            <TvQr
              value={`${origin}/program/new`}
              label="QR code to create a workout on your phone"
            />
            <p className="text-tv-md font-bold">{TV_MAIN_COPY.scanProgram}</p>
          </TvPanel>
        </div>
      </TvNavScreen>
    );

  return (
    <TvNavScreen
      screenKey="choose"
      nav={null}
      hints={[
        ["▲ ▼", "Preview"],
        ["OK", "Continue to readiness check"],
        ["Back", "Home"],
      ]}
    >
      <div className="grid h-full grid-cols-[1.4fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-4">
          <h1 className="text-tv-xl font-bold">{TV_MAIN_COPY.chooseTitle}</h1>
          <p className="text-tv-base text-text-2">{TV_MAIN_COPY.chooseSub}</p>
          {view === "loading" ? (
            <p className="text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>
          ) : view === "error" ? (
            <TvLoadError
              focusId="choose-retry"
              autoFocus
              onRetry={() => void templates.refetch()}
            />
          ) : (
            <ul
              className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3"
              data-focus-list="choose"
            >
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    data-focus=""
                    data-focus-id={`choose-${t.id}`}
                    {...(t.id === initial ? { "data-autofocus": "" } : {})}
                    className={cn(ROW, t.id === shown?.id && "border-text-3")}
                    onFocus={() => setSel(t.id)}
                    onClick={() => tv.go({ name: "preflight", templateId: t.id })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-tv-md font-bold">{t.name}</span>
                      <span className="block text-tv-sm text-text-2">
                        {plural(exerciseCount(t.blocks), "exercise")} ·{" "}
                        {plural(setCount(t.blocks), "set")}
                      </span>
                    </span>
                    <ChevronRight className="size-9 text-text-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TvPanel>
          <TvEyebrow>Preview</TvEyebrow>
          {shown && (
            <>
              <h2 className="truncate text-tv-lg font-bold">{shown.name}</h2>
              <div className="min-h-0 flex-1 overflow-hidden">
                <BlockPreview blocks={shown.blocks} />
              </div>
              <TvButton
                focusId="choose-start"
                variant="primary"
                onPress={() => tv.go({ name: "preflight", templateId: shown.id })}
              >
                {TV_MAIN_COPY.startWorkout}
              </TvButton>
            </>
          )}
        </TvPanel>
      </div>
    </TvNavScreen>
  );
}

// ---------------------------------------------------------------------------------------------
// S08 Preflight

export function TvPreflight({ templateId }: { templateId: string }) {
  const tv = useTv();
  const { api, user } = tv;
  const qc = useQueryClient();
  const profile = useProfile(user.id);
  const templates = useTemplates(user.id);
  const zones = useZones(user.id);
  const t = templates.data?.find((x) => x.id === templateId) ?? null;
  const zonesConfirmed = !!zones.data?.confirmed_at;
  const hr = useLiveHeartRate(user.id, {
    session: { status: "none", liveData: true, isDemo: false },
    zonesConfirmed,
  });
  const health = hr.health;
  // The TV starts real sessions only: DEMO readings never make it ready (demo_mismatch).
  const ready = preflightReady(health, hr.live, false);
  const kindMismatch = preflightKindMismatch(health, hr.live, false);
  useHrStateToast(health, hr.loaded);
  // Acceptance 43: turning Live never moves focus; a polite live region says so.
  const [announce, setAnnounce] = useState("");
  const wasReady = useRef<boolean | null>(null);
  useEffect(() => {
    if (!hr.loaded) return;
    if (wasReady.current === false && ready) setAnnounce(PREFLIGHT_COPY.ready);
    wasReady.current = ready;
  }, [ready, hr.loaded]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(newId());
  // Acceptance 18: Start is the initial focus only when live; decided once, never moved later.
  // The data-autofocus target is fixed by that decision (never follows `ready`), and Start is
  // only soft-disabled, so no HR state change can move focus (h10-design 6, acceptance 43).
  const [startFocus, setStartFocus] = useState<boolean | null>(null);
  useEffect(() => {
    if (startFocus === null && hr.loaded) setStartFocus(ready);
  }, [startFocus, hr.loaded, ready]);
  const startOnFocus = startFocus === true;

  useEffect(() => {
    void api.hr.request(10).catch(() => undefined);
    const i = setInterval(() => void api.hr.request(10).catch(() => undefined), 120_000);
    return () => clearInterval(i);
  }, [api]);

  const tz = profile.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const starting = useRef(false);
  async function begin(liveData: boolean) {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.sessions.start({
        templateId,
        liveData,
        timezone: tz,
        commandId: attempt.current,
      });
      if (!res.ok && res.error === "session_running" && res.session_id) {
        // Another screen started one: this TV shows that workout (one per user).
        tv.go({ name: "session", sessionId: res.session_id });
        return;
      }
      if (!res.ok || !res.session) {
        attempt.current = newId();
        setError(PREFLIGHT_COPY.startFailed);
        return;
      }
      const row = res.session;
      if (row.state === "preparing")
        await api.sessions
          .command({
            sessionId: row.id,
            kind: "start",
            expectedRevision: row.revision,
            source: "tv",
          })
          .catch(() => null);
      void qc.invalidateQueries({ queryKey: qk.current(user.id) });
      tv.go({ name: "session", sessionId: row.id });
    } catch {
      attempt.current = newId();
      setError(PREFLIGHT_COPY.startFailed);
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }

  const chip = preflightChip(health, hr.live?.contact, kindMismatch);
  const name = profile.data?.display_name ?? "";
  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <TvNavScreen
      screenKey={`preflight:${templateId}`}
      nav={null}
      hints={[
        ["OK", "Start"],
        ["Back", "Choose a workout"],
      ]}
    >
      {!t ? (
        <div className="flex flex-col gap-6">
          {loadView(templates) === "error" ? (
            <TvLoadError focusId="pre-retry" autoFocus onRetry={() => void templates.refetch()} />
          ) : (
            <h1 className="text-tv-xl font-bold">
              {templates.isPending ? TV_LOAD_COPY.loading : "This workout isn't available"}
            </h1>
          )}
          <TvButton
            focusId="pre-back"
            autoFocus={loadView(templates) !== "error"}
            onPress={() => tv.go({ name: "choose" })}
          >
            {TV_MAIN_COPY.back}
          </TvButton>
        </div>
      ) : (
        <div className="grid h-full grid-cols-[1.25fr_1fr] gap-12">
          <div className="flex min-h-0 flex-col gap-5">
            <TvEyebrow>{TV_MAIN_COPY.ready}</TvEyebrow>
            <h1 className="shrink-0 truncate text-tv-2xl font-bold leading-tight">{t.name}</h1>
            <TvCard className="flex flex-col gap-2 p-6">
              <div className="flex items-center justify-between gap-4">
                <TvEyebrow>{PREFLIGHT_COPY.strap}</TvEyebrow>
                {hr.loaded && <TvChip {...chip} />}
              </div>
              <p className="text-tv-base text-text-2">
                {!hr.loaded
                  ? hr.error
                    ? PREFLIGHT_HR_COPY.readFailed
                    : PREFLIGHT_HR_COPY.checking
                  : kindMismatch
                    ? PREFLIGHT_HR_COPY.demoOnly
                    : ready && health.bpm != null
                      ? `Reading ${health.bpm} bpm, ${Math.floor((health.ageMs ?? 0) / 1000)}s ago · ${sourceLine(health.via ?? "the relay", name || "you")}`
                      : health.detail}
                {hr.loaded && health.demo && (
                  <span className="ml-3 rounded-chip border-2 border-text px-3 text-tv-xs font-bold text-text">
                    DEMO
                  </span>
                )}
              </p>
              {hr.loaded && !ready && !kindMismatch && (
                <p className="text-tv-sm text-text-2">{TV_HR_COPY.fixLine(host)}</p>
              )}
              <p className="sr-only" aria-live="polite">
                {announce}
              </p>
            </TvCard>
            <TvCard className="flex flex-col gap-2 p-6">
              <div className="flex items-center justify-between gap-4">
                <TvEyebrow>{PREFLIGHT_COPY.zones}</TvEyebrow>
                <TvChip
                  label={zonesConfirmed ? "Confirmed" : "Not set"}
                  tone={zonesConfirmed ? "live" : "warn"}
                />
              </div>
              <p className="text-tv-base text-text-2">
                {zonesConfirmed && zones.data
                  ? `Zone 1 under ${zones.data.b1} · Zone 5 from ${zones.data.b4} bpm.`
                  : TV_MAIN_COPY.zonesHelp}
              </p>
            </TvCard>
            {error && (
              <p role="alert" className="text-tv-base font-bold text-hold">
                {error}
              </p>
            )}
            <p className="text-tv-sm text-text-2">{PREFLIGHT_COPY.withoutLiveHelp}</p>
            <div className="mt-auto flex gap-4 p-2">
              {/* Start is soft-disabled whenever HR is not live: it ignores OK but keeps focus, so
                  an HR change never moves focus. Nothing is disabled while starting (begin()
                  ignores repeats), so focus cannot fall back to the avatar mid-start. The relay QR
                  button stays mounted for the same reason. */}
              <TvButton
                focusId="pre-start"
                autoFocus={startOnFocus}
                variant="primary"
                size="md"
                softDisabled={!ready}
                aria-busy={busy || undefined}
                onPress={() => void begin(true)}
              >
                {TV_MAIN_COPY.startWorkout}
              </TvButton>
              <TvButton
                focusId="pre-nolive"
                autoFocus={!startOnFocus}
                size="md"
                aria-busy={busy || undefined}
                onPress={() => void begin(false)}
              >
                {PREFLIGHT_COPY.withoutLive}
              </TvButton>
              <TvButton
                focusId="pre-relay-qr"
                size="md"
                onPress={() => tv.openModal({ kind: "relay_qr" })}
              >
                {TV_HR_COPY.showQr}
              </TvButton>
              <TvButton
                focusId="pre-back"
                variant="ghost"
                size="md"
                onPress={() => tv.go({ name: "choose" })}
              >
                {TV_MAIN_COPY.back}
              </TvButton>
            </div>
          </div>
          <TvPanel>
            <TvEyebrow>Plan</TvEyebrow>
            <div className="min-h-0 flex-1 overflow-hidden">
              <BlockPreview blocks={t.blocks} />
            </div>
          </TvPanel>
        </div>
      )}
      {tv.modal?.kind === "relay_qr" && <TvRelayQrDialog />}
    </TvNavScreen>
  );
}
