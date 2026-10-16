import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, CircleAlert, Hand, Minus, Plus } from "lucide-react";
import { pageHead } from "@/lib/head";
import { sessionSaveState, useOutbox } from "@/lib/use-outbox";
import { elapsedMs, formatClock, remainingMs, useNow, useWakeLock } from "@/lib/timer";
import { closeSession, draftKey, saveSession, type SessionDraft } from "@/lib/workout-store";
import { loadDraft } from "@/lib/outbox";
import {
  completionOf, headlineFor, isDoubleTap, SESSION_FINISH, SET_LOG, SET_LOG_DELETE, stepResult, stepsOf, type LoggedSet,
} from "@/lib/workout";
import { DButton } from "@/components/dillan/button";
import { Chip, DemoLabel, SaveState, StatusTag } from "@/components/dillan/tags";
import { NumericInput, RestTimer, SetPips } from "@/components/dillan/training-pieces";
import { Sheet, StickyActions, useToast } from "@/components/dillan/overlays";
import { Banner, Card, ScreenState } from "@/components/dillan/surfaces";
import { SpotMark } from "@/components/dillan/spot-mark";

export const Route = createFileRoute("/_authenticated/session/$id")({
  validateSearch: (s: Record<string, unknown>): { finish?: boolean } => (s["finish"] ? { finish: true } : {}),
  head: () => pageHead("Session", "Your training session."),
  component: Session,
});

const FEELINGS = [
  { id: "easy", label: "Easy" },
  { id: "solid", label: "Solid" },
  { id: "hard", label: "Hard" },
  { id: "too_much", label: "Too much" },
];

function Session() {
  const { id } = Route.useParams();
  const { finish } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const toast = useToast();
  const outbox = useOutbox(user.id);
  const now = useNow(250);
  const [d, setD] = useState<SessionDraft | null | undefined>(undefined);
  const [offSheet, setOffSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const lastTap = useRef<number | null>(null);
  const [pendingSet, setPendingSetState] = useState<SessionDraft["inputs"] | null>(null);
  const pendingRef = useRef<SessionDraft["inputs"] | null>(null);
  const setPendingSet = (v: SessionDraft["inputs"] | null) => { pendingRef.current = v; setPendingSetState(v); };
  /** Clear the warning only when no set is waiting to be re-logged. */
  const draftSaved = () => { if (!pendingRef.current) setWriteFailed(false); };
  useWakeLock(d?.phase === "training");

  useEffect(() => {
    void loadDraft<SessionDraft>(draftKey(user.id, id)).then((x) => {
      if (x && finish && x.phase === "training") {
        const next = { ...x, phase: "done" as const, endedAt: Date.now(), restStartedAt: null };
        void saveSession(user.id, next).then(draftSaved).catch(() => setWriteFailed(true));
        setD(next);
      } else setD(x ?? null);
    });
  }, [user.id, id, finish]);

  const update = (patch: Partial<SessionDraft> | ((cur: SessionDraft) => Partial<SessionDraft>)) =>
    setD((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      saveSession(user.id, next).then(draftSaved).catch(() => setWriteFailed(true));
      return next;
    });

  const steps = d ? stepsOf(d.snapshot) : [];
  const step = d ? steps[Math.min(d.stepIndex, steps.length - 1)] : undefined;
  const restLeft = d?.restStartedAt ? remainingMs(d.restStartedAt, d.restTotalMs, now) : 0;
  const resting = !!d && d.phase === "training" && d.restStartedAt !== null && restLeft > 0;

  // Desktop tab shows the countdown (S05).
  useEffect(() => {
    if (!resting) return;
    const prev = document.title;
    document.title = `${formatClock(restLeft)} · Rest · Dillan`;
    return () => void (document.title = prev);
  }, [resting, restLeft]);

  if (d === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <SpotMark size={40} animate className="text-text" title="Loading session" />
      </div>
    );
  }
  if (d === null || !step) {
    return (
      <div className="mx-auto max-w-[640px] px-margin pt-12">
        <ScreenState kind="empty" title="This session isn't on this device" body="Finished sessions are on the Train tab." action={{ label: "Go to Train", onClick: () => void navigate({ to: "/train" }) }} />
      </div>
    );
  }

  const { state: saveState, unsynced: unsyncedCount } = sessionSaveState(outbox.items, id, d.logs.map((l) => l.key));
  const unsynced = { length: unsyncedCount };

  const doneSets = d.logs.filter((l) => l.ref === step.ref);
  const setNo = doneSets.length + 1;
  const stepFinished = doneSets.length >= step.sets;
  const allDone = d.logs.length >= steps.reduce((n, s) => n + s.sets, 0);
  const isDemo = d.snapshot.isDemo;

  const retryWrite = () => {
    if (pendingRef.current) { void logSet(pendingRef.current); return; }
    saveSession(user.id, d).then(draftSaved).catch(() => setWriteFailed(true));
  };

  const prefill = (i: number) => {
    const s = steps[i];
    if (!s) return d.inputs;
    const last = d.last[s.exerciseId];
    return { reps: s.reps ?? last?.reps ?? 0, load: s.load ?? last?.load ?? null, rir: null };
  };

  const logSet = async (inputs: SessionDraft["inputs"] = d.inputs) => {
    const t = Date.now();
    if (stepFinished) return;
    if (!pendingRef.current && isDoubleTap(lastTap.current, t)) return;
    lastTap.current = t;
    let item;
    try {
      item = await outbox.add(SET_LOG, {
        sessionId: id, exerciseId: step.exerciseId, ref: step.ref, setNo,
        reps: inputs.reps, load: inputs.load, unit: step.unit, rir: inputs.rir,
        loggedAt: new Date(t).toISOString(), isDemo,
      });
    } catch {
      setPendingSet(inputs);
      setWriteFailed(true);
      return;
    }
    setPendingSet(null);
    const log: LoggedSet = {
      key: item.idempotencyKey, ref: step.ref, setNo, reps: inputs.reps, load: inputs.load,
      unit: step.unit, rir: inputs.rir, loggedAt: new Date(t).toISOString(),
    };
    const lastOfStep = setNo >= step.sets;
    const lastOfAll = lastOfStep && d.stepIndex >= steps.length - 1;
    const next: SessionDraft = {
      ...d,
      logs: [...d.logs, log],
      restStartedAt: lastOfAll ? null : Date.now(),
      restTotalMs: step.restSeconds * 1000,
      ...(lastOfStep && !lastOfAll ? { stepIndex: d.stepIndex + 1, inputs: prefill(d.stepIndex + 1) } : {}),
    };
    try {
      await saveSession(user.id, next);
    } catch {
      // The set is queued; show it as logged so it isn't logged twice.
      setD(next);
      setWriteFailed(true);
      return;
    }
    setWriteFailed(false);
    setD(next);
    toast({
      text: `Set ${setNo} logged · saved on this device`,
      undo: () => {
        outbox.add(SET_LOG_DELETE, { sessionId: id, setKey: log.key }).catch(() => setWriteFailed(true));
        update((cur) => ({
          logs: cur.logs.filter((l) => l.key !== log.key),
          restStartedAt: null,
          stepIndex: steps.findIndex((s) => s.ref === log.ref),
        }));
      },
    });
  };

  const end = (stopped = false) =>
    update({ phase: "done", stopped, endedAt: Date.now(), restStartedAt: null });

  const saveAndClose = async () => {
    if (saving) return;
    setSaving(true);
    try {
    await outbox.add(
      SESSION_FINISH,
      { id, completion: completionOf(steps, d.logs, d.stopped), endedAt: new Date(d.endedAt ?? Date.now()).toISOString(), feeling: d.feeling, note: d.note },
      1, // a session row is created at version 1 and this is its first and only edit
    );
    await closeSession(user.id, id);
    } catch {
      setWriteFailed(true);
      setSaving(false);
      return;
    }
    void navigate({ to: "/train" });
  };

  // ---------- S07 · Session complete ----------
  if (d.phase === "done") {
    const completion = completionOf(steps, d.logs, d.stopped);
    const minutes = Math.max(1, Math.round(((d.endedAt ?? Date.now()) - d.startedAt) / 60000));
    return (
      <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-margin pb-6 pt-[calc(var(--safe-t)+32px)]">
        <SpotMark size={64} className="text-text" />
        <p className="mt-5 font-voice text-voice-xl leading-[1.2]">{headlineFor(completion)}</p>
        {isDemo && <DemoLabel className="mt-3" />}
        {writeFailed && (
          <Banner
            className="mt-3"
            icon={<CircleAlert className="size-5 shrink-0 text-text-2" aria-hidden />}
            action={<DButton size="sm" variant="outline" onClick={retryWrite}>Try again</DButton>}
          >
            This browser isn't keeping data between visits (private mode or storage full). Logging still works while this tab is open.{pendingSet && " That set wasn't logged."}
          </Banner>
        )}

        <ul className="mt-6 flex flex-col gap-2">
          {steps.map((s) => {
            const r = stepResult(s, d.logs);
            return (
              <li key={s.ref} className="flex items-center justify-between gap-3 rounded-btn bg-surface px-4 py-3">
                <span className="min-w-0 text-headline font-bold">{s.name}</span>
                {r.kind === "done" && <StatusTag kind="done">Done</StatusTag>}
                {r.kind === "partial" && <StatusTag kind="neutral">Partial · {r.done} of {r.of} sets</StatusTag>}
                {r.kind === "skipped" && <StatusTag kind="neutral">Skipped</StatusTag>}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card>
            <p className="text-footnote font-bold uppercase tracking-wide text-text-2">Time</p>
            <p className="mt-1 font-num text-num-l font-extrabold tabular">{minutes}<span className="ml-1 text-title3 font-bold">min</span></p>
          </Card>
          <Card>
            <p className="text-footnote font-bold uppercase tracking-wide text-text-2">Sets logged</p>
            <p className="mt-1 font-num text-num-l font-extrabold tabular">{d.logs.length}</p>
            <p className="text-footnote text-text-2">Entered by you</p>
          </Card>
        </div>

        <fieldset className="mt-6">
          <legend className="text-subhead font-bold">How did it feel? <span className="font-normal text-text-2">· optional</span></legend>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
            {FEELINGS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={d.feeling === f.id}
                onClick={() => update({ feeling: d.feeling === f.id ? null : f.id })}
                className={d.feeling === f.id ? "press h-11 rounded-chip bg-text px-4 text-subhead font-bold text-bg" : "press h-11 rounded-chip border border-line bg-surface px-4 text-subhead font-medium"}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-subhead font-bold" htmlFor="note">Note <span className="font-normal text-text-2">· optional</span></label>
          <textarea id="note" rows={2} value={d.note} maxLength={1000} onChange={(e) => update({ note: e.target.value })}
            className="mt-2 w-full rounded-btn border border-line bg-surface p-3 text-body" />
        </fieldset>

        <div className="mt-auto pt-6">
          <DButton variant="primary" loading={saving} disabled={saving} onClick={saveAndClose}>Save session</DButton>
          {outbox.loaded && (saveState === "failed" ? (
            <div className="mt-3 flex justify-center"><SaveState state="failed" count={unsyncedCount} onRetry={outbox.retryNow} /></div>
          ) : (
            <p className="mt-3 text-center text-footnote text-text-2">
              {saveState === "synced"
                ? `${d.logs.length} sets synced · nothing waiting`
                : `${unsynced.length} ${unsynced.length === 1 ? "change" : "changes"} saved on this device · will sync when you're online`}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // ---------- S04 Set · S05 Rest ----------
  const shownDone = doneSets.map((l) => l.setNo);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-margin pt-[calc(var(--safe-t)+12px)]">
      <header className="flex items-center justify-between gap-3">
        <DButton variant="secondary" size="md" onClick={() => end(false)}>End</DButton>
        <div className="text-center">
          <p className="text-subhead font-bold text-text-2">{d.snapshot.title}</p>
          <p className="font-num text-title2 font-extrabold tabular" aria-label="Elapsed time">{formatClock(elapsedMs(d.startedAt, now || d.startedAt))}</p>
        </div>
        <span className="w-[72px]" aria-hidden />
      </header>
      <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
        {steps.map((s, i) => (
          <span key={s.ref} className={i < d.stepIndex ? "h-1 rounded-full bg-text" : i === d.stepIndex ? "h-1 rounded-full bg-spot" : "h-1 rounded-full bg-surface-2"} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {step.priority === "optional" ? <StatusTag kind="neutral" icon={false}>Optional</StatusTag> : <StatusTag kind="priority" icon={false}>Main</StatusTag>}
        <span className="text-subhead font-medium text-text-2">Exercise {d.stepIndex + 1} of {steps.length}</span>
        <span className="ml-auto">{outbox.loaded && <SaveState state={saveState} count={unsynced.length} onRetry={outbox.retryNow} />}</span>
      </div>
      {isDemo && <div className="mt-2"><DemoLabel /></div>}
      {writeFailed && (
        <Banner
          className="mt-3"
          icon={<CircleAlert className="size-5 shrink-0 text-text-2" aria-hidden />}
          action={<DButton size="sm" variant="outline" onClick={retryWrite}>Try again</DButton>}
        >
          This browser isn't keeping data between visits (private mode or storage full). Logging still works while this tab is open.{pendingSet && " That set wasn't logged."}
        </Banner>
      )}

      {resting ? (
        <section className="flex flex-1 flex-col items-center justify-center py-6">
          <p className="mb-6 text-headline font-bold">Rest</p>
          <RestTimer remainingMs={restLeft} totalMs={d.restTotalMs} />
          <p className="mt-3 text-subhead text-text-2">of {formatClock(d.restTotalMs)} · your rest, your call.</p>
          <div className="mt-5 grid w-full max-w-[360px] grid-cols-3 gap-2">
            <DButton size="md" icon={<Minus className="size-4" aria-hidden />} onClick={() => update((c) => ({ restTotalMs: Math.max(15000, c.restTotalMs - 15000) }))}>15s</DButton>
            <DButton size="md" icon={<Plus className="size-4" aria-hidden />} onClick={() => update((c) => ({ restTotalMs: c.restTotalMs + 15000 }))}>15s</DButton>
            <DButton size="md" onClick={() => update({ restStartedAt: null })}>Skip</DButton>
          </div>
          <Card className="mt-5 w-full">
            <p className="text-footnote font-bold uppercase tracking-wide text-text-2">Up next</p>
            <p className="mt-1 text-headline font-bold">Set {setNo} of {step.sets} · {step.name}</p>
          </Card>
          <Banner className="mt-4 w-full">Keeps correct time if your screen locks. No sound while the screen is off.</Banner>
        </section>
      ) : (
        <section className="flex-1">
          <h1 className="mt-3 text-title1 font-bold leading-tight">{step.name}</h1>
          <p className="mt-2 text-body text-text-2">
            Plan: {step.sets} sets × {step.reps ?? "—"} reps{step.load !== null ? ` at ${step.load} ${step.unit}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2"><Chip>Set {Math.min(setNo, step.sets)} of {step.sets}</Chip></div>
          <div className="mt-5"><SetPips total={step.sets} done={shownDone} current={Math.min(setNo, step.sets)} /></div>
          <div className="mt-6 flex flex-col gap-5">
            <NumericInput label="Reps" value={d.inputs.reps} onChange={(v) => update((c) => ({ inputs: { ...c.inputs, reps: Math.round(v) } }))} last={d.last[step.exerciseId]?.reps ?? null} />
            <div className="border-t border-line" />
            {d.inputs.load === null ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-subhead text-text-2">No weight · bodyweight</p>
                <DButton size="sm" onClick={() => update((c) => ({ inputs: { ...c.inputs, load: d.last[step.exerciseId]?.load ?? 0 } }))}>Add weight</DButton>
              </div>
            ) : (
              <NumericInput label="Load" unit={step.unit} decimal step={2.5} value={d.inputs.load} onChange={(v) => update((c) => ({ inputs: { ...c.inputs, load: v } }))} last={d.last[step.exerciseId]?.load ?? null} />
            )}
          </div>
          <fieldset className="mt-6">
            <legend className="text-subhead font-bold">Reps left in the tank <span className="font-normal text-text-2">· optional</span></legend>
            <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={d.inputs.rir === n}
                  onClick={() => update((c) => ({ inputs: { ...c.inputs, rir: c.inputs.rir === n ? null : n } }))}
                  className={d.inputs.rir === n ? "press h-12 rounded-btn bg-text font-num text-headline font-bold text-bg" : "press h-12 rounded-btn border border-line bg-surface font-num text-headline font-bold"}>
                  {n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <StickyActions className="mt-6">
        {!resting && (allDone ? (
          <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} onClick={() => end(false)}>Finish session</DButton>
        ) : (
          <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} onClick={() => void logSet()}>Log set</DButton>
        ))}
        <DButton variant="quiet" size="md" className="mt-1 w-full" icon={<Hand className="size-5" aria-hidden />} onClick={() => setOffSheet(true)}>
          Something feels off
        </DButton>
      </StickyActions>

      <Sheet open={offSheet} onClose={() => setOffSheet(false)} title="Something feels off">
        <p className="font-voice text-voice text-text">Thanks for telling me. You can stop right now, and what you did still counts.</p>
        <div className="mt-5 flex flex-col gap-2">
          <DButton variant="secondary" onClick={() => { setOffSheet(false); end(true); }}>Stop the session here</DButton>
          <DButton variant="quiet" size="md" onClick={() => setOffSheet(false)}>Keep going, lighter</DButton>
        </div>
      </Sheet>
    </div>
  );
}
