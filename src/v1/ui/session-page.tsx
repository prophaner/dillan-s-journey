// S09 Dashboard (phone/desktop controller), S10 Paused, M3 End this workout?, M7 actual reps/weight,
// then S11 Summary once the server says the session ended. Everything shown comes from the
// authoritative row plus pending commands labelled "Pending" (controller.ts); timers interpolate
// from server timestamps with the server-corrected clock. Reload/Back never ends the session.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Check, CloudOff, Pause, Play, Slash, X, BatteryLow } from "lucide-react";
import { isAfterLastSet } from "@/v1/core/engine";
import { exerciseForStep } from "@/v1/core/steps";
import { activeMs, formatDuration, restRemainingMs } from "@/v1/core/timing";
import type { Block, EngineState, Exercise, Step, ZoneCutoffs } from "@/v1/core/types";
import { isWeight } from "@/v1/core/validate";
import { useProfile } from "@/v1/data/queries";
import type { SessionController, SessionView } from "@/v1/session/controller";
import { doneText, loadText, repsText } from "@/v1/session/format";
import { sourceLine } from "@/v1/core/health";
import { healthFor, useLiveHr, useLiveZones } from "@/v1/session/live-hr";
import { useNow, useSessionController, useWakeLock } from "@/v1/session/use-session";
import { useUser } from "./user-context";
import { SummaryView, SUMMARY_COPY } from "./summary-view";
import { ZONE_COPY, ZoneBreakdown, ZonePill } from "./zone-pieces";
import { DButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { Eyebrow, Field, TextInput } from "@/components/dillan/form-pieces";
import { Sheet } from "@/components/dillan/overlays";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";

export const DASH_COPY = {
  complete: "Complete set",
  skip: "Skip set",
  rest: "Rest",
  skipRest: "Skip rest",
  undo: "Undo",
  undoLast: "Undo last set",
  restFinished: "Rest finished",
  nextUp: "Next up",
  active: "Active (excludes pauses)",
  pause: "Pause",
  resume: "Resume",
  end: "End",
  endWorkout: "End workout",
  allDone: "All sets done",
  allDoneBody: "End the workout to save it. You can still undo the last set.",
  pausedBody: "Time in zone and rest are not counting while paused.",
  endTitle: "End this workout?",
  endBody: "Everything so far is saved. Sets you haven't reached are recorded as not reached.",
  // h10-design S11 replaces the End dialog text when live heart rate is on.
  endTitleLive: "End workout?",
  endBodyLive:
    "Heart rate after this point won't count toward this session, and the relay will disconnect the strap.",
  keepGoing: "Keep going",
  endAndSave: "End and save",
  offline: "Offline—changes pending",
  timingPending: "Pause and End take effect when they reach the server.",
  saving: "Saving…",
  pending: "Pending",
  adjust: "Change reps or weight",
  notStarted: "This workout hasn't started yet.",
  startNow: "Start workout",
  cancelStart: "Cancel this workout",
  endedPending: "Ended on this device. It will save when you're back online — keep Dillan open.",
  canceledTitle: "Workout canceled",
} as const;

export function SessionPage({ sessionId }: { sessionId: string }) {
  const user = useUser();
  const { view, controller } = useSessionController(sessionId, user.id);
  const row = view.row;
  useWakeLock(row?.state === "active" || row?.state === "paused");

  if (view.loadState === "loading" && !row) return <ScreenState kind="loading" />;
  if (!row)
    return (
      <Shell title="Workout">
        <ScreenState
          kind={view.loadState === "error" ? "offline" : "empty"}
          title={view.loadState === "error" ? "Couldn't load this workout" : "Workout not found"}
          body={
            view.loadState === "error"
              ? "Check your connection. Nothing was lost: the workout is saved on the server."
              : "It may belong to another account or have been removed."
          }
          {...(view.loadState === "error"
            ? { action: { label: "Try again", onClick: () => void controller.refetch() } }
            : {})}
        />
      </Shell>
    );
  if (row.state === "ended")
    return (
      <Shell
        title={row.outcome === "discarded" ? DASH_COPY.canceledTitle : SUMMARY_COPY.title}
        hideBack
      >
        <SummaryView row={row} />
      </Shell>
    );
  return <Dashboard view={view} controller={controller} />;
}

function Shell({
  title,
  children,
  trailing,
  hideBack,
  inertHeader,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  hideBack?: boolean;
  /** a modal overlay is open: the header is not reachable behind it */
  inertHeader?: boolean;
}) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[600px] px-margin pb-safe-b lg:max-w-[720px]">
      <header
        className="flex min-h-[72px] items-center gap-2 pt-4 lg:pt-8"
        inert={inertHeader || undefined}
      >
        {!hideBack && (
          <Link
            to="/"
            aria-label="Home (the workout keeps running)"
            className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-full"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 break-words text-title2 font-bold leading-tight">{title}</h1>
        {trailing}
      </header>
      {children}
    </div>
  );
}

function Dashboard({ view, controller }: { view: SessionView; controller: SessionController }) {
  const user = useUser();
  const profile = useProfile(user.id);
  const row = view.row as NonNullable<SessionView["row"]>;
  const p = view.projected as EngineState;
  const now = useNow();
  const hr = useLiveHr(user.id);
  const cutoffs: ZoneCutoffs | null = row.zone_snapshot?.cutoffs ?? null;
  const status = p.state === "active" ? "active" : p.state === "paused" ? "paused" : "none";
  const health = healthFor(
    hr,
    now,
    { status, liveData: row.live_data, isDemo: row.is_demo },
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
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [allZones, setAllZones] = useState(false);
  const [adjust, setAdjust] = useState(false);

  const name = profile.data?.display_name ?? "";
  const step = p.steps[p.cursor] ?? null;
  const ex = step ? exerciseForStep(row.snapshot.blocks, step) : null;
  const paused = p.state === "paused";
  const sending = view.pending.some((c) => c.status === "sending");
  const pendingKeys = new Set(view.pendingKeys);
  const afterLast = isAfterLastSet(p);
  const restLeft = restRemainingMs(p, now);
  const doneCount = p.steps.filter((s) => p.results[s.key]).length;
  const pauseBtn = useRef<HTMLButtonElement>(null);
  const wasPaused = useRef(paused);
  useEffect(() => {
    // Leaving the paused overlay: put focus back on Pause/Resume instead of losing it.
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (wasPaused.current && !paused && (!active || active === document.body))
      pauseBtn.current?.focus();
    wasPaused.current = paused;
  }, [paused]);

  const endNow = () => {
    setConfirmEnd(false);
    controller.send("end");
  };

  if (p.state === "preparing")
    return (
      <Shell title={row.snapshot.name}>
        <Card>
          <p className="text-headline">{DASH_COPY.notStarted}</p>
          <div className="mt-4 flex flex-col gap-2">
            <DButton variant="primary" size="lg" onClick={() => controller.send("start")}>
              {DASH_COPY.startNow}
            </DButton>
            <DButton variant="quiet" size="md" onClick={() => controller.send("discard")}>
              {DASH_COPY.cancelStart}
            </DButton>
          </div>
        </Card>
      </Shell>
    );

  if (p.state === "ended")
    return (
      <Shell title={row.snapshot.name}>
        <SyncBanners view={view} onDismiss={() => controller.dismissNotice()} />
        <Card className="mt-3">
          <p className="text-headline">{DASH_COPY.endedPending}</p>
        </Card>
      </Shell>
    );

  return (
    <Shell
      title={row.snapshot.name}
      inertHeader={paused && !confirmEnd}
      trailing={
        <span className="flex h-11 shrink-0 items-center gap-2 rounded-chip bg-surface-2 pl-1.5 pr-3 text-subhead font-bold">
          <span className="grid size-8 place-items-center rounded-full bg-surface text-footnote">
            {(name.trim()[0] ?? "?").toUpperCase()}
          </span>
          <span className="max-w-[8rem] truncate">{name}</span>
        </span>
      }
    >
      <div inert={(paused && !confirmEnd) || undefined}>
        <SyncBanners view={view} onDismiss={() => controller.dismissNotice()} />

        <div className="flex flex-col gap-3">
          {/* Metrics: BPM + freshness, active time, zone + time in zone */}
          <Card>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3">
              <p className="flex min-w-0 items-baseline gap-2">
                <span
                  className={cn(
                    "font-num text-num-m font-extrabold tabular leading-none",
                    health.deemphasize && "text-text-3",
                  )}
                >
                  {health.showBpm && health.bpm != null ? health.bpm : "––"}
                </span>
                {health.demo && (
                  <span className="rounded-chip border border-text px-2 text-footnote font-bold">
                    DEMO
                  </span>
                )}
              </p>
              <p className="text-right font-num text-num-m font-extrabold tabular leading-none">
                {formatDuration(activeMs(p, now))}
              </p>
              <p className="mt-1 text-footnote font-bold uppercase tracking-wider text-text-2">
                BPM
              </p>
              <p className="mt-1 text-right text-footnote font-bold uppercase tracking-wider text-text-2">
                {DASH_COPY.active}
              </p>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-subhead" aria-live="polite">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  health.id === "H3_live" && !paused
                    ? "bg-steady"
                    : health.id === "H10_off"
                      ? "border border-text-3"
                      : "bg-hold",
                )}
                aria-hidden
              />
              <span className="font-bold">{health.label}</span>
              {health.batteryLow && hr.live?.battery_pct != null && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-footnote text-hold">
                  <BatteryLow className="size-3" aria-hidden />
                  <span className="sr-only">Strap battery </span>
                  {hr.live.battery_pct}%
                </span>
              )}
            </p>
            <p className="mt-1 text-footnote text-text-2">{health.detail}</p>
            {row.live_data && health.via && health.id !== "H0_not_set_up" && (
              <p className="mt-0.5 text-footnote text-text-2">
                {sourceLine(health.via, name || "you")}
              </p>
            )}
            {row.live_data && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <ZonePill zone={zones.currentZone} cutoffs={cutoffs} />
                <span className="text-subhead text-text-2">
                  {ZONE_COPY.timeInZone}{" "}
                  <span className="font-num tabular text-text">
                    {zones.currentZone ? formatDuration(zones.timeInZoneMs) : "––"}
                  </span>
                </span>
              </div>
            )}
            {row.live_data && (
              <DButton
                variant="outline"
                size="md"
                className="mt-3 w-full"
                onClick={() => setAllZones(true)}
              >
                {ZONE_COPY.allZones}
              </DButton>
            )}
          </Card>

          {/* Rest */}
          {restLeft != null && (
            <Card variant="proposal">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Eyebrow>{restLeft === 0 ? DASH_COPY.restFinished : DASH_COPY.rest}</Eyebrow>
                {step && ex && (
                  <span className="text-subhead text-text-2">
                    Next: {ex.name} · set {step.set + 1}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span
                  className="font-num text-num-l font-extrabold tabular leading-none"
                  role="timer"
                  aria-label={`Rest, ${formatDuration(restLeft)} left`}
                >
                  {formatDuration(restLeft)}
                </span>
                <div className="flex gap-2">
                  <DButton
                    variant="outline"
                    size="md"
                    disabled={paused}
                    onClick={() => controller.send("undo")}
                  >
                    {DASH_COPY.undo}
                  </DButton>
                  <DButton
                    variant="secondary"
                    size="md"
                    disabled={paused}
                    onClick={() => controller.send("skip_rest")}
                  >
                    {DASH_COPY.skipRest}
                  </DButton>
                </div>
              </div>
              <RestBar p={p} left={restLeft} />
            </Card>
          )}

          {/* Current exercise */}
          {step && ex ? (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Eyebrow>
                  {step.group
                    ? `Superset ${step.label} · round ${step.set + 1} of ${step.sets}`
                    : `Exercise ${exerciseNumber(row.snapshot.blocks, step)} of ${exerciseCount(row.snapshot.blocks)}`}
                </Eyebrow>
                <span className="font-num text-subhead tabular text-text-2">
                  {doneCount}/{p.steps.length} sets
                </span>
              </div>
              <h2 className="mt-2 break-words text-title1 font-bold leading-tight">{ex.name}</h2>
              <p className="mt-1 text-headline text-text-2">
                {step.group ? "Round" : "Set"} {step.set + 1} of {step.sets} ·{" "}
                {repsText(ex.reps, ex.rep_mode)} · {loadText(ex.weight, ex.unit, ex.load_basis)}
                {ex.rep_mode === "per_side" ? " · complete both sides" : ""}
              </p>
              {ex.instructions && (
                <p className="mt-2 break-words text-subhead text-text-2">{ex.instructions}</p>
              )}
              <SetRows p={p} step={step} ex={ex} pendingKeys={pendingKeys} />
              <div className="mt-4 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
                <DButton
                  variant="primary"
                  size="lg"
                  disabled={paused}
                  onClick={() => controller.send("complete_set")}
                >
                  {DASH_COPY.complete}
                </DButton>
                <DButton
                  variant="outline"
                  size="lg"
                  disabled={paused}
                  onClick={() => controller.send("skip_set")}
                >
                  {DASH_COPY.skip}
                </DButton>
              </div>
              <DButton
                variant="quiet"
                size="md"
                className="mt-1 w-full"
                disabled={paused}
                onClick={() => setAdjust(true)}
              >
                {DASH_COPY.adjust}
              </DButton>
            </Card>
          ) : afterLast ? (
            <Card>
              <h2 className="text-title2 font-bold">{DASH_COPY.allDone}</h2>
              <p className="mt-1 text-subhead text-text-2">{DASH_COPY.allDoneBody}</p>
              <DButton
                variant="primary"
                size="lg"
                className="mt-4"
                disabled={paused}
                onClick={endNow}
              >
                {DASH_COPY.endWorkout}
              </DButton>
              <DButton
                variant="quiet"
                size="md"
                className="mt-1 w-full"
                disabled={paused}
                onClick={() => controller.send("undo")}
              >
                {DASH_COPY.undoLast}
              </DButton>
            </Card>
          ) : null}

          <NextUp p={p} blocks={row.snapshot.blocks} />

          <div className="grid grid-cols-2 gap-2 pb-6">
            <DButton
              ref={pauseBtn}
              variant="secondary"
              size="lg"
              onClick={() => controller.send(paused ? "resume" : "pause")}
              icon={
                paused ? (
                  <Play className="size-5 fill-current" aria-hidden />
                ) : (
                  <Pause className="size-5 fill-current" aria-hidden />
                )
              }
            >
              {paused ? DASH_COPY.resume : DASH_COPY.pause}
            </DButton>
            <DButton
              variant="outline"
              size="lg"
              onClick={() => (afterLast ? endNow() : setConfirmEnd(true))}
            >
              {DASH_COPY.end}
            </DButton>
          </div>
          {sending && <span className="sr-only">{DASH_COPY.saving}</span>}
        </div>
      </div>

      {paused && !confirmEnd && (
        <PausedOverlay
          title={row.snapshot.name}
          name={name}
          active={formatDuration(activeMs(p, now))}
          bpm={health.showBpm && health.bpm != null ? String(health.bpm) : "––"}
          label={health.label}
          onResume={() => controller.send("resume")}
          onEnd={() => setConfirmEnd(true)}
        />
      )}

      <ConfirmDialog
        open={confirmEnd}
        title={row.live_data ? DASH_COPY.endTitleLive : DASH_COPY.endTitle}
        cancelLabel={DASH_COPY.keepGoing}
        confirmLabel={DASH_COPY.endAndSave}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={endNow}
      >
        {row.live_data ? DASH_COPY.endBodyLive : DASH_COPY.endBody}
      </ConfirmDialog>

      <Sheet open={allZones} onClose={() => setAllZones(false)} title={ZONE_COPY.timeInEach}>
        <ZoneBreakdown
          zoneMs={zones.totals.zone_ms}
          unmeasuredMs={zones.totals.unmeasured_ms}
          cutoffs={cutoffs}
        />
      </Sheet>

      {adjust && step && ex && (
        <AdjustSheet
          ex={ex}
          step={step}
          onClose={() => setAdjust(false)}
          onSave={(reps, weight) => {
            setAdjust(false);
            controller.send("complete_set", { reps, weight });
          }}
        />
      )}
    </Shell>
  );
}

function exerciseCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.type === "straight" ? 1 : b.exercises.length), 0);
}

function exerciseNumber(blocks: Block[], step: Step): number {
  let n = 0;
  for (let i = 0; i < step.block; i++) {
    const b = blocks[i];
    n += !b ? 0 : b.type === "straight" ? 1 : b.exercises.length;
  }
  return n + step.exercise + 1;
}

function RestBar({ p, left }: { p: EngineState; left: number }) {
  const total =
    p.rest_ends_at != null && p.rest_started_at != null
      ? Math.max(1, p.rest_ends_at - p.rest_started_at)
      : 1;
  const pct = Math.min(100, Math.max(0, (1 - left / total) * 100));
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-chip bg-surface-2" aria-hidden>
      <div className="h-full bg-text" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SetRows({
  p,
  step,
  ex,
  pendingKeys,
}: {
  p: EngineState;
  step: Step;
  ex: Exercise;
  pendingKeys: Set<string>;
}) {
  const rows = p.steps.filter((s) => s.block === step.block && s.exercise === step.exercise);
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {rows.map((s) => {
        const r = p.results[s.key];
        const current = s.key === step.key;
        const pending = pendingKeys.has(s.key);
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-btn border px-3 py-2",
              current ? "border-text" : "border-line",
            )}
            aria-current={current ? "step" : undefined}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full font-num text-subhead font-bold",
                r?.status === "done" && !pending ? "bg-steady text-bg" : "bg-surface-2 text-text",
              )}
            >
              {r?.status === "done" && !pending ? (
                <Check className="size-4" aria-hidden />
              ) : r?.status === "skipped" ? (
                <Slash className="size-4" aria-hidden />
              ) : (
                s.set + 1
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-num text-headline font-bold tabular">
                {r?.status === "done"
                  ? doneText(r, ex)
                  : `${repsText(s.reps, ex.rep_mode)} · ${s.weight == null ? "Bodyweight" : `${s.weight} ${ex.unit}`}`}
              </span>
              <span className="block text-subhead text-text-2">
                {pending
                  ? `${DASH_COPY.pending} · ${r?.status === "skipped" ? "Skipped" : "Done"}`
                  : r?.status === "done"
                    ? "Done"
                    : r?.status === "skipped"
                      ? "Skipped — not counted as zero reps"
                      : current
                        ? "Current set"
                        : "Up next"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NextUp({ p, blocks }: { p: EngineState; blocks: Block[] }) {
  const cur = p.steps[p.cursor];
  const next = p.steps
    .slice(p.cursor + 1)
    .find((s) => !cur || s.block !== cur.block || s.exercise !== cur.exercise);
  if (!next) return null;
  const ex = exerciseForStep(blocks, next);
  if (!ex) return null;
  return (
    <div className="rounded-card bg-surface-2 p-4">
      <Eyebrow>{DASH_COPY.nextUp}</Eyebrow>
      <p className="mt-1 break-words">
        <span className="font-bold">{ex.name}</span>{" "}
        <span className="text-subhead text-text-2">
          {repsText(ex.reps, ex.rep_mode)} · {loadText(ex.weight, ex.unit, ex.load_basis)}
        </span>
      </p>
    </div>
  );
}

function SyncBanners({ view, onDismiss }: { view: SessionView; onDismiss: () => void }) {
  const queued = view.pending.length > 0;
  return (
    <div className="mb-3 flex flex-col gap-2 empty:hidden" aria-live="polite">
      {view.offline && queued && (
        <div className="flex items-center gap-2 rounded-btn bg-hold-tint px-4 py-3 text-subhead font-medium text-text">
          <CloudOff className="size-5 shrink-0 text-hold" aria-hidden />
          <span className="min-w-0 flex-1">
            {DASH_COPY.offline}
            {view.timingPending && (
              <span className="block font-normal text-text-2">{DASH_COPY.timingPending}</span>
            )}
          </span>
          <span className="font-num tabular text-text-2">{view.pending.length}</span>
        </div>
      )}
      {view.notice && (
        <div className="flex items-start gap-2 rounded-btn bg-hold-tint px-4 py-3 text-subhead text-text">
          <span className="min-w-0 flex-1">{view.notice}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-m-2 grid size-11 shrink-0 place-items-center"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function PausedOverlay({
  title,
  name,
  active,
  bpm,
  label,
  onResume,
  onEnd,
}: {
  title: string;
  name: string;
  active: string;
  bpm: string;
  label: string;
  onResume: () => void;
  onEnd: () => void;
}) {
  const resume = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => resume.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-text/40 p-3 sm:place-items-center">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paused-title"
        className="animate-settle w-full max-w-md rounded-card bg-surface p-5 shadow-float"
        onKeyDown={(e) => {
          // Back/Escape on the paused overlay does nothing (handoff §3: stay paused).
          if (e.key === "Escape") e.preventDefault();
          // Tab stays inside the overlay (the dashboard behind it is inert too).
          if (e.key === "Tab") {
            const els = box.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
            if (!els || els.length === 0) return;
            const first = els[0] as HTMLElement;
            const last = els[els.length - 1] as HTMLElement;
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <Eyebrow>Paused · {name}</Eyebrow>
        <h2 id="paused-title" className="mt-1 break-words text-title2 font-bold">
          {title}
        </h2>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-num text-num-m font-extrabold tabular leading-none">{active}</p>
            <p className="mt-1 text-footnote font-bold uppercase tracking-wider text-text-2">
              Active · frozen
            </p>
          </div>
          <div className="text-right">
            <p className="font-num text-title1 font-bold tabular leading-none">{bpm}</p>
            <p className="mt-1 text-footnote font-bold uppercase tracking-wider text-text-2">
              bpm · {label}
            </p>
          </div>
        </div>
        <p className="mt-4 text-subhead text-text-2">{DASH_COPY.pausedBody}</p>
        <div className="mt-5 flex flex-col gap-2">
          <DButton
            ref={resume}
            variant="primary"
            size="lg"
            icon={<Play className="size-5 fill-current" aria-hidden />}
            onClick={onResume}
          >
            {DASH_COPY.resume}
          </DButton>
          <DButton variant="secondary" size="md" className="w-full" onClick={onEnd}>
            {DASH_COPY.endAndSave}
          </DButton>
        </div>
      </div>
    </div>
  );
}

function AdjustSheet({
  ex,
  step,
  onClose,
  onSave,
}: {
  ex: Exercise;
  step: Step;
  onClose: () => void;
  onSave: (reps: number, weight: number | null) => void;
}) {
  const [reps, setReps] = useState(String(step.reps));
  const [weight, setWeight] = useState(step.weight == null ? "" : String(step.weight));
  const [err, setErr] = useState<{ reps?: string; weight?: string }>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = Number(reps);
    const w = weight.trim() === "" ? null : Number(weight);
    const next: typeof err = {};
    if (!/^\d+$/.test(reps.trim()) || r < 0 || r > 200) next.reps = "Enter 0 to 200 reps.";
    if (w != null && !isWeight(w)) next.weight = "Enter 0 to 1000 in steps of 0.5, or leave blank.";
    setErr(next);
    if (next.reps || next.weight) return;
    onSave(r, w);
  };
  return (
    <Sheet open onClose={onClose} title={`${ex.name} · set ${step.set + 1}`}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={ex.rep_mode === "per_side" ? "Reps (per side)" : "Reps"}
            htmlFor="adj-reps"
            error={err.reps ?? null}
          >
            <TextInput
              id="adj-reps"
              inputMode="numeric"
              value={reps}
              invalid={!!err.reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </Field>
          <Field label={`Weight (${ex.unit})`} htmlFor="adj-weight" error={err.weight ?? null}>
            <TextInput
              id="adj-weight"
              inputMode="decimal"
              placeholder="Bodyweight"
              value={weight}
              invalid={!!err.weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-footnote text-text-2">
          Changes apply to this session only, not the saved workout.
        </p>
        <DButton type="submit" variant="primary" size="lg">
          {DASH_COPY.complete}
        </DButton>
      </form>
    </Sheet>
  );
}
