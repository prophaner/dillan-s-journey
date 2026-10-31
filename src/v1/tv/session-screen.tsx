// TV S09 Dashboard, S10 Paused, M3 End this workout?, All zones, S11 Summary (handoff §3, 4.4;
// mockups tv-09..tv-15). Same engine client as the phone (SessionController, source "tv"): the
// server row is authoritative and the phone and TV mirror it through Realtime (F08). Back on the
// dashboard pauses, Back on the paused overlay does nothing, Play/Pause toggles.

import { useEffect, useMemo, useRef } from "react";
import { BatteryLow, Check, Pause, Play, Slash } from "lucide-react";
import { isAfterLastSet } from "@/v1/core/engine";
import { exerciseForStep } from "@/v1/core/steps";
import { activeMs, formatDuration, restRemainingMs } from "@/v1/core/timing";
import type { Block, EngineState, Step, WorkoutSessionRow, ZoneCutoffs } from "@/v1/core/types";
import { useProfile, useSummary } from "@/v1/data/queries";
import { counts, loadText, repsText } from "@/v1/session/format";
import { sourceLine } from "@/v1/core/health";
import { coverageLine } from "@/v1/core/hr-views";
import { healthFor, useLiveHr, useLiveZones } from "@/v1/session/live-hr";
import { useNow, useSessionController, useWakeLock } from "@/v1/session/use-session";
import { DASH_COPY } from "@/v1/ui/session-page";
import { SUMMARY_COPY } from "@/v1/ui/summary-view";
import { ZONE_COPY } from "@/v1/ui/zone-pieces";
import { formatClock } from "@/v1/ui/timezones";
import { cn } from "@/lib/utils";
import { useTv } from "./context";
import { TV_HR_COPY, TvHrSheet } from "./hr-pieces";
import { tvMemoryStorage } from "./memory-store";
import { TvNoteText } from "./screens-history";
import {
  TvAvatar,
  TvButton,
  TvDialog,
  TvEyebrow,
  TvHints,
  TvPanel,
  TvZoneBars,
  TvZonePill,
} from "./ui";

export const TV_SESSION_COPY = {
  restoredPause: "Paused while Dillan was in the background",
  switchUser: "Switch user",
  notesNone: "Add notes from your phone — typing with a remote is no fun. Saved automatically.",
  saved: "Saved automatically.",
  done: "Done",
} as const;

export function TvSession({ sessionId }: { sessionId: string }) {
  const tv = useTv();
  // memory-only queue: user data is never persisted on a shared TV (handoff §6)
  const { view, controller } = useSessionController(sessionId, tv.user.id, "tv", tvMemoryStorage);
  const row = view.row;
  const p = view.projected;
  const state = p?.state ?? null;
  // Ended here but not yet on the server (offline): an honest "will save" screen, never the
  // live dashboard, and Back stays put until the end is saved.
  const endPending = state === "ended" && !!row && row.state !== "ended";
  useWakeLock(state === "active" || state === "paused");

  // "Paused while Dillan was in the background" belongs to that one pause: once the workout
  // leaves Paused (Resume, Play/Pause, the phone) the reason is gone.
  const { clearRestoredPause } = tv;
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current === "paused" && state !== null && state !== "paused")
      clearRestoredPause();
    prevState.current = state;
  }, [state, clearRestoredPause]);

  // Register Back = Pause and Play/Pause with the app (handoff key map).
  const { setSessionHandle } = tv;
  useEffect(() => {
    setSessionHandle({
      sessionId,
      state: endPending ? "ending" : state,
      pause: () => {
        if (state === "active") controller.send("pause");
      },
      togglePause: () => {
        if (state === "active") controller.send("pause");
        else if (state === "paused") controller.send("resume");
      },
    });
  }, [setSessionHandle, sessionId, state, endPending, controller]);
  useEffect(() => () => setSessionHandle(null), [setSessionHandle]);

  if (!row || !p)
    return (
      <div data-screen={`session:${sessionId}:loading`} className="flex h-full flex-col">
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <p className="text-tv-lg text-text-2">
            {view.loadState === "loading" ? "Loading the workout…" : "Couldn't load this workout"}
          </p>
          {view.loadState !== "loading" && (
            <TvButton focusId="session-home" autoFocus onPress={() => tv.go({ name: "home" })}>
              Back to Home
            </TvButton>
          )}
        </div>
      </div>
    );

  if (row.state === "ended") return <TvSummary row={row} />;
  if (endPending)
    return (
      <div data-screen={`session:${sessionId}:end-pending`} className="flex h-full flex-col">
        <div className="m-auto flex max-w-[1200px] flex-col items-center gap-8 text-center">
          <h1 className="text-tv-2xl font-bold">{row.snapshot.name}</h1>
          <p className="text-tv-md text-text-2" role="status">
            {DASH_COPY.endedPending}
          </p>
          <TvButton focusId="end-pending-home" autoFocus onPress={() => tv.go({ name: "home" })}>
            Back to Home
          </TvButton>
        </div>
      </div>
    );
  if (p.state === "preparing")
    return (
      <div data-screen={`session:${sessionId}:preparing`} className="flex h-full flex-col">
        <div className="m-auto flex flex-col items-center gap-8 text-center">
          <h1 className="text-tv-2xl font-bold">{row.snapshot.name}</h1>
          <p className="text-tv-md text-text-2">{DASH_COPY.notStarted}</p>
          <div className="flex gap-4">
            <TvButton
              focusId="prep-start"
              autoFocus
              variant="primary"
              onPress={() => controller.send("start")}
            >
              {DASH_COPY.startNow}
            </TvButton>
            <TvButton focusId="prep-cancel" onPress={() => controller.send("discard")}>
              {DASH_COPY.cancelStart}
            </TvButton>
          </div>
        </div>
      </div>
    );
  return (
    <TvDashboard
      row={row}
      p={p}
      pendingKeys={view.pendingKeys}
      offline={view.offline && view.pending.length > 0}
      notice={view.notice}
      send={(k) => controller.send(k)}
    />
  );
}

type Send = (
  k: "complete_set" | "skip_set" | "undo" | "skip_rest" | "pause" | "resume" | "end",
) => void;

function exerciseNumber(blocks: Block[], step: Step): { n: number; of: number } {
  let n = 0;
  let of = 0;
  blocks.forEach((b, i) => {
    const c = b.type === "straight" ? 1 : b.exercises.length;
    if (i < step.block) n += c;
    of += c;
  });
  return { n: n + step.exercise + 1, of };
}

function TvDashboard({
  row,
  p,
  pendingKeys,
  offline,
  notice,
  send,
}: {
  row: WorkoutSessionRow;
  p: EngineState;
  pendingKeys: string[];
  offline: boolean;
  notice: string | null;
  send: Send;
}) {
  const tv = useTv();
  const profile = useProfile(tv.user.id);
  const name = profile.data?.display_name ?? "";
  const now = useNow();
  const hr = useLiveHr(tv.user.id);
  const cutoffs: ZoneCutoffs | null = row.zone_snapshot?.cutoffs ?? null;
  const paused = p.state === "paused";
  const health = healthFor(
    hr,
    now,
    { status: paused ? "paused" : "active", liveData: row.live_data, isDemo: row.is_demo },
    !!cutoffs,
  );
  const zones = useLiveZones(
    row.id,
    row.is_demo,
    row.live_data,
    hr.live,
    p,
    cutoffs,
    now,
    health.countsTowardZone,
  );
  const step = p.steps[p.cursor] ?? null;
  const ex = step ? exerciseForStep(row.snapshot.blocks, step) : null;
  const afterLast = isAfterLastSet(p);
  const restLeft = restRemainingMs(p, now);
  const resting = restLeft != null;
  const doneCount = p.steps.filter((s) => p.results[s.key]).length;
  const pending = useMemo(() => new Set(pendingKeys), [pendingKeys]);
  const modal = tv.modal;
  const bpm = health.showBpm && health.bpm != null ? String(health.bpm) : "––";
  const next = p.steps
    .slice(p.cursor + 1)
    .find((s) => !step || s.block !== step.block || s.exercise !== step.exercise);
  const nextEx = next ? exerciseForStep(row.snapshot.blocks, next) : null;
  const tz = profile.data?.timezone ?? row.start_timezone;
  const pos = step ? exerciseNumber(row.snapshot.blocks, step) : null;

  // While paused, everything behind the overlay is out of reach (the overlay is the modal).
  return (
    <div data-screen={`session:${row.id}`} className="relative flex h-full flex-col">
      <div className="flex h-full flex-col" inert={paused || !!modal || undefined}>
        <header className="flex shrink-0 items-center gap-6 pb-8">
          <span className="flex items-center gap-3 rounded-chip bg-surface-2 py-2 pl-2 pr-6 text-tv-base font-bold">
            <TvAvatar name={name} size={56} />
            {name}
          </span>
          <h1 className="min-w-0 flex-1 truncate text-tv-lg font-bold">{row.snapshot.name}</h1>
          {offline && (
            <span className="rounded-chip bg-hold-tint px-5 py-2 text-tv-sm font-bold text-hold">
              {DASH_COPY.offline}
            </span>
          )}
          <span className="font-num text-tv-md tabular text-text-2">{formatClock(now, tz)}</span>
        </header>
        {notice && (
          <p
            role="status"
            className="mb-4 rounded-tv-md bg-hold-tint px-6 py-3 text-tv-sm text-text"
          >
            {notice}
          </p>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-12">
          <div className="flex min-h-0 flex-col gap-6 overflow-hidden">
            <div className="flex items-baseline justify-between gap-4">
              <TvEyebrow>
                {step
                  ? step.group
                    ? `Superset ${step.group} · round ${step.set + 1} of ${step.sets}`
                    : `Exercise ${pos?.n} of ${pos?.of}`
                  : "Finished"}
              </TvEyebrow>
              <span className="font-num text-tv-md tabular text-text-2">
                {doneCount}/{p.steps.length} sets
              </span>
            </div>
            {resting && (
              <div className="flex shrink-0 items-center gap-10 rounded-tv-lg border border-line bg-surface p-8">
                <div>
                  <TvEyebrow>{restLeft === 0 ? DASH_COPY.restFinished : DASH_COPY.rest}</TvEyebrow>
                  <p
                    role="timer"
                    className="font-num text-tv-3xl font-extrabold leading-none tabular"
                  >
                    {formatDuration(restLeft)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <TvEyebrow>{DASH_COPY.nextUp}</TvEyebrow>
                  {step && ex ? (
                    <>
                      <p className="truncate text-tv-md font-bold">{ex.name}</p>
                      <p className="truncate text-tv-base text-text-2">
                        Set {step.set + 1} · {repsText(ex.reps, ex.rep_mode)} ·{" "}
                        {loadText(ex.weight, ex.unit, ex.load_basis)}
                      </p>
                    </>
                  ) : (
                    <p className="text-tv-md font-bold">Finish</p>
                  )}
                </div>
                <div className="flex gap-4">
                  <TvButton focusId="skip-rest" autoFocus onPress={() => send("skip_rest")}>
                    {DASH_COPY.skipRest}
                  </TvButton>
                  <TvButton focusId="undo" variant="ghost" onPress={() => send("undo")}>
                    {DASH_COPY.undo}
                  </TvButton>
                </div>
              </div>
            )}
            {step && ex ? (
              <>
                <p
                  className={cn(
                    "shrink-0 font-bold leading-[1.05] tracking-tight",
                    resting ? "truncate text-tv-xl" : "line-clamp-2 text-tv-3xl",
                  )}
                >
                  {ex.name}
                </p>
                <p className="shrink-0 text-tv-md text-text-2">
                  {step.group ? "Round" : "Set"} {step.set + 1} of {step.sets} ·{" "}
                  {repsText(ex.reps, ex.rep_mode)} · {loadText(ex.weight, ex.unit, ex.load_basis)}
                  {ex.rep_mode === "per_side" ? " · complete both sides" : ""}
                </p>
                {ex.instructions && !resting && (
                  <p className="line-clamp-2 text-tv-base text-text-2">{ex.instructions}</p>
                )}
                <SetPills p={p} step={step} pending={pending} />
              </>
            ) : afterLast ? (
              <>
                <h2 className="text-tv-2xl font-bold">{DASH_COPY.allDone}</h2>
                <p className="text-tv-md text-text-2">
                  End the workout to save it. Add notes on your phone.
                </p>
              </>
            ) : null}
            {nextEx && next && !resting && (
              <div className="rounded-tv-md bg-surface-2 px-6 py-4">
                <TvEyebrow>{DASH_COPY.nextUp}</TvEyebrow>
                <p className="truncate text-tv-base">
                  <span className="font-bold">{nextEx.name}</span>{" "}
                  <span className="text-text-2">
                    {repsText(nextEx.reps, nextEx.rep_mode)} ·{" "}
                    {loadText(nextEx.weight, nextEx.unit, nextEx.load_basis)}
                  </span>
                </p>
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-4 p-3">
              {step && ex ? (
                <>
                  <TvButton
                    focusId="complete"
                    autoFocus={!resting}
                    variant="primary"
                    size="xl"
                    icon={<Check className="size-9" aria-hidden />}
                    onPress={() => send("complete_set")}
                  >
                    {DASH_COPY.complete}
                  </TvButton>
                  <TvButton focusId="skip" size="xl" onPress={() => send("skip_set")}>
                    {DASH_COPY.skip}
                  </TvButton>
                </>
              ) : (
                <TvButton
                  focusId="end-workout"
                  autoFocus
                  variant="primary"
                  size="xl"
                  onPress={() => send("end")}
                >
                  {DASH_COPY.endWorkout}
                </TvButton>
              )}
              <TvButton
                focusId="pause"
                size="xl"
                icon={<Pause className="size-8 fill-current" aria-hidden />}
                onPress={() => send("pause")}
              >
                {DASH_COPY.pause}
              </TvButton>
              {step && ex && (
                <TvButton
                  focusId="end"
                  size="xl"
                  variant="ghost"
                  onPress={() => tv.openModal({ kind: "end" })}
                >
                  {DASH_COPY.end}
                </TvButton>
              )}
              {afterLast && (
                <TvButton
                  focusId="undo-last"
                  size="xl"
                  variant="ghost"
                  onPress={() => send("undo")}
                >
                  {DASH_COPY.undo}
                </TvButton>
              )}
            </div>
          </div>
          <TvPanel className="gap-6 p-10">
            <TvEyebrow>Heart rate</TvEyebrow>
            <div className="flex items-end gap-4">
              <span
                className={cn(
                  "font-num text-tv-metric font-extrabold leading-[0.85] tabular",
                  health.deemphasize && "text-text-3",
                )}
                data-testid="tv-bpm"
              >
                {bpm}
              </span>
              <span className="pb-4 text-tv-md font-bold text-text-2">BPM</span>
              {health.demo && (
                <span className="mb-4 rounded-chip border-2 border-text px-3 text-tv-xs font-bold">
                  DEMO
                </span>
              )}
            </div>
            <div aria-live="polite">
              <p className="flex items-center gap-3 text-tv-md font-bold">
                <span
                  aria-hidden
                  className={cn(
                    "size-4 rounded-full",
                    health.id === "H3_live" && !paused
                      ? "bg-steady"
                      : health.id === "H10_off"
                        ? "border-2 border-text-3"
                        : "bg-hold",
                  )}
                />
                {health.label}
                {health.batteryLow && hr.live?.battery_pct != null && (
                  <span className="ml-2 inline-flex items-center gap-1 text-tv-xs text-hold">
                    <BatteryLow className="size-3" aria-hidden />
                    <span className="sr-only">Strap battery </span>
                    {hr.live.battery_pct}%
                  </span>
                )}
              </p>
              <p className="line-clamp-3 text-tv-sm text-text-2">{health.detail}</p>
              {row.live_data && health.via && health.id !== "H0_not_set_up" && (
                <p className="truncate text-tv-xs text-text-3">
                  {sourceLine(health.via, name || "you")}
                </p>
              )}
            </div>
            {row.live_data && (
              <>
                <div className="flex flex-col gap-3">
                  <TvEyebrow>Zone</TvEyebrow>
                  <TvZonePill zone={zones.currentZone} cutoffs={cutoffs} />
                </div>
                <div className="flex justify-between gap-6">
                  <div>
                    <TvEyebrow>In this zone</TvEyebrow>
                    <p className="font-num text-tv-2xl font-extrabold leading-none tabular">
                      {zones.currentZone ? formatDuration(zones.timeInZoneMs) : "––"}
                    </p>
                  </div>
                  <div className="text-right">
                    <TvEyebrow>Active time</TvEyebrow>
                    <p className="font-num text-tv-2xl font-extrabold leading-none tabular">
                      {formatDuration(activeMs(p, now))}
                    </p>
                  </div>
                </div>
              </>
            )}
            {!row.live_data && (
              <div>
                <TvEyebrow>{DASH_COPY.active}</TvEyebrow>
                <p className="font-num text-tv-2xl font-extrabold leading-none tabular">
                  {formatDuration(activeMs(p, now))}
                </p>
              </div>
            )}
            {/* h10-design acceptance 45: All zones ↓ Heart rate ↓ Pause */}
            <div className="mt-auto flex gap-4">
              {row.live_data && (
                <TvButton
                  focusId="all-zones"
                  size="md"
                  className="flex-1"
                  data-focus-down="hr-panel"
                  onPress={() => tv.openModal({ kind: "zones" })}
                >
                  {ZONE_COPY.allZones}
                </TvButton>
              )}
              <TvButton
                focusId="hr-panel"
                size="md"
                className="flex-1"
                data-focus-down="pause"
                onPress={() => tv.openModal({ kind: "hr" })}
              >
                {TV_HR_COPY.sheetTitle}
              </TvButton>
            </div>
          </TvPanel>
        </div>
        <TvHints
          items={[
            ["OK", resting ? DASH_COPY.skipRest : DASH_COPY.complete],
            ["◀ ▶", "Skip / Pause / End"],
            ["Back", "Pause (never ends the workout)"],
          ]}
        />
      </div>

      {paused && (
        <div
          className="absolute inset-0 z-30 grid place-items-center bg-bg/85"
          data-modal="paused"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-paused-title"
          inert={!!modal || undefined}
        >
          <div className="flex w-[1180px] flex-col gap-6 rounded-tv-lg border border-line bg-surface p-12">
            <TvEyebrow>Paused · {name}</TvEyebrow>
            <h2 id="tv-paused-title" className="truncate text-tv-xl font-bold">
              {row.snapshot.name}
            </h2>
            {tv.restoredPause && (
              <p className="text-tv-md font-bold text-hold">{TV_SESSION_COPY.restoredPause}</p>
            )}
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="font-num text-tv-3xl font-extrabold leading-none tabular">
                  {formatDuration(activeMs(p, now))}
                </p>
                <p className="mt-2 text-tv-sm font-bold uppercase text-text-2">Active · frozen</p>
              </div>
              <div className="text-right">
                <p className="font-num text-tv-2xl font-bold leading-none tabular">{bpm}</p>
                <p className="mt-2 text-tv-sm font-bold uppercase text-text-2">
                  bpm · {health.label}
                </p>
              </div>
            </div>
            <p className="text-tv-base text-text-2">{DASH_COPY.pausedBody}</p>
            <div className="flex gap-4">
              <TvButton
                focusId="resume"
                autoFocus
                variant="primary"
                size="xl"
                icon={<Play className="size-8 fill-current" aria-hidden />}
                onPress={() => {
                  tv.clearRestoredPause();
                  send("resume");
                }}
              >
                {DASH_COPY.resume}
              </TvButton>
              <TvButton
                focusId="paused-end"
                size="xl"
                onPress={() => tv.openModal({ kind: "end" })}
              >
                {DASH_COPY.endAndSave}
              </TvButton>
              <TvButton
                focusId="paused-switch"
                size="xl"
                variant="ghost"
                onPress={() => tv.requestSwitch()}
              >
                {TV_SESSION_COPY.switchUser}
              </TvButton>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === "end" && (
        <TvDialog
          id="end"
          title={row.live_data ? DASH_COPY.endTitleLive : DASH_COPY.endTitle}
          actions={
            <>
              <TvButton focusId="keep-going" autoFocus onPress={() => tv.openModal(null)}>
                {DASH_COPY.keepGoing}
              </TvButton>
              <TvButton
                focusId="end-and-save"
                variant="danger"
                onPress={() => {
                  tv.openModal(null);
                  tv.clearRestoredPause();
                  send("end");
                }}
              >
                {DASH_COPY.endAndSave}
              </TvButton>
            </>
          }
        >
          {row.live_data ? DASH_COPY.endBodyLive : DASH_COPY.endBody}
        </TvDialog>
      )}
      {modal?.kind === "zones" && (
        <TvDialog
          id="zones"
          title={ZONE_COPY.timeInEach}
          actions={
            <TvButton focusId="zones-close" autoFocus onPress={() => tv.openModal(null)}>
              Close
            </TvButton>
          }
        >
          <TvZoneBars
            zoneMs={zones.totals.zone_ms}
            unmeasuredMs={zones.totals.unmeasured_ms}
            cutoffs={cutoffs}
          />
          <p className="mt-4 text-tv-sm">{ZONE_COPY.caption}</p>
        </TvDialog>
      )}
      {modal?.kind === "hr" && (
        <TvHrSheet health={health} live={hr.live} sensor={hr.sensorRow} userName={name} />
      )}
    </div>
  );
}

function SetPills({ p, step, pending }: { p: EngineState; step: Step; pending: Set<string> }) {
  const rows = p.steps.filter((s) => s.block === step.block && s.exercise === step.exercise);
  return (
    <ol className="flex shrink-0 flex-wrap gap-4" aria-label="Sets">
      {rows.map((s) => {
        const r = p.results[s.key];
        const cur = s.key === step.key;
        const isPending = pending.has(s.key);
        return (
          <li
            key={s.key}
            aria-label={`Set ${s.set + 1}: ${isPending ? "pending" : r ? r.status : cur ? "current" : "upcoming"}`}
            className={cn(
              "flex size-[128px] flex-col items-center justify-center rounded-tv-md border-2 font-num",
              cur ? "border-spot bg-spot-tint text-spot-ink" : "border-line bg-surface",
              r?.status === "done" && !isPending && "border-steady",
            )}
          >
            <span className="text-tv-xl font-bold">
              {r?.status === "done" && !isPending ? (
                <Check className="size-12 text-steady" aria-hidden />
              ) : r?.status === "skipped" ? (
                <Slash className="size-12 text-text-2" aria-hidden />
              ) : (
                s.set + 1
              )}
            </span>
            <span className="text-tv-xs font-bold">
              {isPending
                ? DASH_COPY.pending
                : r?.status === "done"
                  ? `${r.reps ?? 0}${r.weight != null ? ` × ${r.weight}` : ""}`
                  : r?.status === "skipped"
                    ? "Skipped"
                    : cur
                      ? "Now"
                      : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------
// S11 Summary

function TvSummary({ row }: { row: WorkoutSessionRow }) {
  const tv = useTv();
  const summary = useSummary(tv.user.id, row.id, row.outcome !== "discarded");
  const c = counts(row);
  const s = summary.data;
  const cutoffs = row.zone_snapshot?.cutoffs ?? null;
  const discarded = row.outcome === "discarded";
  const done = () => tv.go({ name: "calendar" });
  return (
    <div data-screen={`summary:${row.id}`} className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-8">
          <div className="flex items-center gap-6">
            <span
              className={cn(
                "rounded-chip px-6 py-2 text-tv-base font-bold",
                row.outcome === "completed"
                  ? "bg-steady-tint text-steady"
                  : "bg-surface-2 text-text-2",
              )}
            >
              {discarded
                ? DASH_COPY.canceledTitle
                : row.outcome === "completed"
                  ? SUMMARY_COPY.completed
                  : SUMMARY_COPY.endedEarly}
            </span>
            {row.started_at && row.ended_at && (
              <span className="text-tv-base text-text-2">
                {formatClock(row.started_at, row.start_timezone)}–
                {formatClock(row.ended_at, row.start_timezone)}
              </span>
            )}
          </div>
          <h1 className="shrink-0 truncate text-tv-2xl font-bold">{row.snapshot.name}</h1>
          {discarded ? (
            <p className="text-tv-md text-text-2">{SUMMARY_COPY.discarded}</p>
          ) : (
            <div className="flex gap-16">
              <Metric value={s ? formatDuration(s.active_ms) : "…"} label="Active" />
              <Metric value={c.done} label="Sets done" />
              {c.skipped > 0 && <Metric value={c.skipped} label="Skipped" />}
              {c.notReached > 0 && <Metric value={c.notReached} label="Not reached" />}
            </div>
          )}
          <div className="rounded-tv-lg border border-line bg-surface p-8">
            <TvEyebrow>Session notes</TvEyebrow>
            <p className="mt-2 text-tv-base text-text-2">{TV_SESSION_COPY.notesNone}</p>
            <TvNoteText sessionId={row.id} hideEmpty />
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <TvButton focusId="summary-done" autoFocus variant="primary" size="xl" onPress={done}>
              {TV_SESSION_COPY.done}
            </TvButton>
            {!discarded && <p className="text-tv-sm text-text-2">{TV_SESSION_COPY.saved}</p>}
          </div>
        </div>
        <TvPanel>
          <TvEyebrow>Heart-rate zones</TvEyebrow>
          {!row.live_data ? (
            <p className="text-tv-base text-text-2">{ZONE_COPY.noLiveData}</p>
          ) : !s || s.hr_status === "pending" ? (
            <p className="text-tv-base text-text-2">{SUMMARY_COPY.finalizing}</p>
          ) : (
            <>
              {!cutoffs && <p className="text-tv-base text-text-2">{SUMMARY_COPY.zonesNotSet}</p>}
              <TvZoneBars zoneMs={s.zone_ms} unmeasuredMs={s.unmeasured_ms} cutoffs={cutoffs} />
              {s.measured_ms > 0 && <p className="text-tv-sm text-text-2">{coverageLine(s)}</p>}
              <p className="text-tv-sm text-text-2">{ZONE_COPY.caption}</p>
            </>
          )}
        </TvPanel>
      </div>
      <TvHints items={[["OK", "Done → Calendar"]]} />
    </div>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="font-num text-tv-3xl font-extrabold leading-none tabular">{value}</p>
      <p className="mt-2 text-tv-sm font-bold uppercase tracking-[0.1em] text-text-2">{label}</p>
    </div>
  );
}
