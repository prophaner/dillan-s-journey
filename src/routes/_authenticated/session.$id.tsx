import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Check, CircleAlert, Hand, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { pageHead } from "@/lib/head";
import { sessionSaveState, useOutbox } from "@/lib/use-outbox";
import { elapsedMs, formatClock, remainingMs, useNow, useWakeLock } from "@/lib/timer";
import { closeSession, draftKey, loadExercises, saveSession, type SessionDraft } from "@/lib/workout-store";
import { loadDraft, sessionOf } from "@/lib/outbox";
import {
  applySwaps, completionOf, headlineFor, isDoubleTap, nextTurn, SESSION_DISCARD, SESSION_FINISH, SET_LOG, SET_LOG_DELETE,
  SET_LOG_EDIT, stepResult, stepsOf, supersetPattern, turnsOf, type LoggedSet, type Step,
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
  const [pendingUndo, setPendingUndoState] = useState<LoggedSet | null>(null);
  const pendingUndoRef = useRef<LoggedSet | null>(null);
  const setPendingUndo = (v: LoggedSet | null) => { pendingUndoRef.current = v; setPendingUndoState(v); };
  const inFlight = useRef(false);
  type Vals = SessionDraft["inputs"];
  const [editing, setEditing] = useState<LoggedSet | null>(null);
  const [editVals, setEditVals] = useState<Vals>({ reps: 0, load: null, rir: null });
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapList, setSwapList] = useState<{ id: string; name: string }[] | "loading" | "offline" | "failed">("loading");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const finishKey = useRef<string | null>(null);
  /** Clear the warning only when no set or undo is waiting to be retried. */
  const draftSaved = () => { if (!pendingRef.current && !pendingUndoRef.current) setWriteFailed(false); };
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

  const steps = d ? applySwaps(stepsOf(d.snapshot), d.swaps) : [];
  const turns = turnsOf(steps);
  const turn = d ? nextTurn(turns, d.logs) : undefined;
  const step: Step | undefined = turn?.step ?? steps[steps.length - 1];
  const stepIndex = turn?.stepIndex ?? steps.length - 1;
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
  const setNo = turn?.setNo ?? step.sets;
  const allDone = !turn;
  const group = step.blockType === "superset" ? steps.filter((s) => s.blockPosition === step.blockPosition) : [];
  const finishItem = outbox.items.find((i) => i.kind === SESSION_FINISH && sessionOf(i) === id);
  const discardItem = outbox.items.find((i) => i.kind === SESSION_DISCARD && sessionOf(i) === id);
  const isDemo = d.snapshot.isDemo;

  const bannerText =
    "This browser isn't keeping data between visits (private mode or storage full)." +
    (pendingSet || pendingUndo ? "" : " Logging still works while this tab is open.") +
    (pendingSet ? " That set wasn't logged." : "") +
    (pendingUndo ? " That undo didn't go through." : "");

  const retryWrite = () => {
    if (editing) { void saveEdit(); return; }
    if (pendingUndoRef.current) { void undoSet(pendingUndoRef.current); return; }
    if (pendingRef.current) { void logSet(pendingRef.current); return; }
    saveSession(user.id, d).then(draftSaved).catch(() => setWriteFailed(true));
  };

  const prefill = (s: Step): Vals => {
    const last = d.last[s.exerciseId];
    return { reps: s.reps ?? last?.reps ?? 0, load: s.load ?? last?.load ?? null, rir: null };
  };
  const inputs: Vals = d.inputsByRef?.[step.ref] ?? prefill(step);
  const setInputs = (patch: Partial<Vals>) =>
    update((c) => ({ inputsByRef: { ...c.inputsByRef, [step.ref]: { ...(c.inputsByRef?.[step.ref] ?? prefill(step)), ...patch } } }));

  const logSet = async (vals: Vals = inputs) => {
    if (inFlight.current || pendingUndoRef.current || !turn) return; // no new set while an undo is waiting
    const t = Date.now();
    if (isDoubleTap(lastTap.current, t)) return;
    inFlight.current = true;
    try {
      await logSetOnce(vals, t);
    } finally {
      inFlight.current = false;
    }
  };

  const logSetOnce = async (inputs: Vals, t: number) => {
    if (!turn) return;
    lastTap.current = t;
    let item;
    try {
      item = await outbox.add(SET_LOG, {
        sessionId: id, exerciseId: step.exerciseId, ref: step.ref, setNo,
        reps: inputs.reps, load: inputs.load, unit: step.unit, rir: inputs.rir,
        loggedAt: new Date(t).toISOString(), isDemo,
      });
    } catch {
      lastTap.current = null; // let Try again run right away
      setPendingSet(inputs);
      setWriteFailed(true);
      return;
    }
    setPendingSet(null);
    const log: LoggedSet = {
      key: item.idempotencyKey, ref: step.ref, setNo, reps: inputs.reps, load: inputs.load,
      unit: step.unit, rir: inputs.rir, loggedAt: new Date(t).toISOString(), version: 1, exerciseId: step.exerciseId,
    };
    const logs = [...d.logs, log];
    const after = nextTurn(turns, logs);
    const rest = after && turn.restAfter > 0;
    const next: SessionDraft = {
      ...d,
      logs,
      restStartedAt: rest ? Date.now() : null,
      restTotalMs: turn.restAfter * 1000,
      stepIndex: after?.stepIndex ?? d.stepIndex,
      inputsByRef: { ...d.inputsByRef, [step.ref]: inputs },
    };
    try {
      await saveSession(user.id, next);
    } catch {
      // The set is queued; show it as logged so it isn't logged twice.
      setD(next);
      setWriteFailed(true);
      return;
    }
    if (!pendingUndoRef.current) setWriteFailed(false);
    setD(next);
    toast({
      text: `Set ${setNo} logged · saved on this device`,
      undo: () => void undoSet(log),
    });
  };

  /** Remove a set only after its delete is queued; otherwise keep it and offer Try again. */
  const undoSet = async (log: LoggedSet) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await undoSetOnce(log);
    } finally {
      inFlight.current = false;
    }
  };

  const undoSetOnce = async (log: LoggedSet) => {
    try {
      await outbox.add(SET_LOG_DELETE, { sessionId: id, setKey: log.key });
    } catch {
      setPendingUndo(log);
      setWriteFailed(true);
      return;
    }
    setPendingUndo(null);
    if (editing?.key === log.key) setEditing(null);
    update((cur) => ({
      logs: cur.logs.filter((l) => l.key !== log.key),
      restStartedAt: null,
      stepIndex: steps.findIndex((s) => s.ref === log.ref),
    }));
  };

  /** Tap a done pip: the values reopen in place. Saving corrects that same set (no new row). */
  const openEdit = (n: number) => {
    const log = doneSets.find((l) => l.setNo === n);
    if (!log) return;
    setEditing(log);
    setEditVals({ reps: log.reps ?? 0, load: log.load, rir: log.rir });
  };

  const saveEdit = async () => {
    if (!editing || inFlight.current) return;
    inFlight.current = true;
    const log = editing;
    try {
      const version = log.version ?? 1;
      await outbox.add(SET_LOG_EDIT, { sessionId: id, setKey: log.key, ...editVals }, version);
      const logs = d.logs.map((l) => (l.key === log.key ? { ...l, ...editVals, version: version + 1 } : l));
      await saveSession(user.id, { ...d, logs });
      setD({ ...d, logs });
      setEditing(null);
      draftSaved();
      toast({ text: `Set ${log.setNo} changed · saved on this device` });
    } catch {
      setWriteFailed(true);
    } finally {
      inFlight.current = false;
    }
  };

  const openSwap = () => {
    setSwapOpen(true);
    setSwapList("loading");
    loadExercises(user.id).then(setSwapList).catch(() => setSwapList(navigator.onLine ? "failed" : "offline"));
  };
  /** This session only: the plan snapshot is untouched. */
  const swapTo = (ex: { id: string; name: string } | null) => {
    setSwapOpen(false);
    update((c) => {
      const swaps = { ...c.swaps };
      if (ex && ex.id !== stepsOf(c.snapshot).find((s) => s.ref === step.ref)?.exerciseId) swaps[step.ref] = { exerciseId: ex.id, name: ex.name };
      else delete swaps[step.ref];
      const by = { ...c.inputsByRef };
      delete by[step.ref];
      return { swaps, inputsByRef: by };
    });
  };

  /** Discard: queued like every write; the server removes the session and its sets. */
  const discard = async () => {
    if (saving || finishItem || finishKey.current) return;
    setSaving(true);
    try {
      if (!discardItem) await outbox.add(SESSION_DISCARD, { sessionId: id });
      await closeSession(user.id, id);
    } catch {
      setWriteFailed(true);
      setSaving(false);
      return;
    }
    toast({ text: "Session discarded" });
    void navigate({ to: "/train" });
  };

  const end = (stopped = false) =>
    update({ phase: "done", stopped, endedAt: Date.now(), restStartedAt: null });

  const saveAndClose = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Reuse a finish already queued for this session (e.g. after a reload), never queue a second one.
      if (!finishKey.current && finishItem) finishKey.current = finishItem.idempotencyKey;
      if (!finishKey.current) {
        const item = await outbox.add(
          SESSION_FINISH,
          { id, completion: completionOf(steps, d.logs, d.stopped), endedAt: new Date(d.endedAt ?? Date.now()).toISOString(), feeling: d.feeling, note: d.note },
          1, // a session row is created at version 1 and this is its first and only edit
        );
        finishKey.current = item.idempotencyKey;
      }
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
            {bannerText}
          </Banner>
        )}

        <ul className="mt-6 flex flex-col gap-2">
          {steps.map((s) => {
            const r = stepResult(s, d.logs);
            return (
              <li key={s.ref} className="flex items-center justify-between gap-3 rounded-btn bg-surface px-4 py-3">
                <span className="min-w-0 text-headline font-bold">
                  {s.name}
                  {s.name !== s.plannedName && <span className="block text-footnote font-normal text-text-2">Swapped for {s.plannedName} · this session only</span>}
                </span>
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
          <DButton variant="primary" loading={saving} disabled={saving || !outbox.loaded || !!discardItem} onClick={saveAndClose}>Save session</DButton>
          {!finishItem && !finishKey.current && (confirmDiscard ? (
            <div className="mt-3 rounded-btn bg-surface-2 p-3">
              <p className="text-subhead">This removes the session and its {d.logs.length} {d.logs.length === 1 ? "set" : "sets"} from your history.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DButton size="md" variant="secondary" disabled={saving || !outbox.loaded} onClick={discard}>Discard</DButton>
                <DButton size="md" variant="quiet" onClick={() => setConfirmDiscard(false)}>Keep it</DButton>
              </div>
            </div>
          ) : (
            <DButton variant="quiet" size="md" className="mt-2 w-full" icon={<Trash2 className="size-5" aria-hidden />} onClick={() => setConfirmDiscard(true)}>Discard session</DButton>
          ))}
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
  const vals = editing ? editVals : inputs;
  const setVals = (patch: Partial<Vals>) => (editing ? setEditVals((v) => ({ ...v, ...patch })) : setInputs(patch));
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
          <span key={s.ref} className={stepResult(s, d.logs).kind === "done" ? "h-1 rounded-full bg-text" : i === stepIndex ? "h-1 rounded-full bg-spot" : "h-1 rounded-full bg-surface-2"} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {step.priority === "optional" ? <StatusTag kind="neutral" icon={false}>Optional</StatusTag> : <StatusTag kind="priority" icon={false}>Main</StatusTag>}
        {group.length > 0 ? (
          <>
            <StatusTag kind="neutral" icon={false}>Superset</StatusTag>
            <span className="text-subhead font-bold">Round {turn?.round ?? step.sets} of {turn?.rounds ?? step.sets}</span>
          </>
        ) : (
          <span className="text-subhead font-medium text-text-2">Exercise {stepIndex + 1} of {steps.length}</span>
        )}
        <span className="ml-auto">{outbox.loaded && <SaveState state={saveState} count={unsynced.length} onRetry={outbox.retryNow} />}</span>
      </div>
      {isDemo && <div className="mt-2"><DemoLabel /></div>}
      {writeFailed && (
        <Banner
          className="mt-3"
          icon={<CircleAlert className="size-5 shrink-0 text-text-2" aria-hidden />}
          action={<DButton size="sm" variant="outline" onClick={retryWrite}>Try again</DButton>}
        >
          {bannerText}
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
            <p className="mt-1 text-headline font-bold">
              {turn ? (turn.round ? `Round ${turn.round} · ${turn.step.name}` : `Set ${turn.setNo} of ${turn.step.sets} · ${turn.step.name}`) : "Finish session"}
            </p>
          </Card>
          <Banner className="mt-4 w-full">Keeps correct time if your screen locks. No sound while the screen is off.</Banner>
        </section>
      ) : (
        <section className="flex-1">
          {group.length > 0 && (
            <>
              <p className="mt-3 text-subhead text-text-2">{supersetPattern(group)}</p>
              <ol className="mt-3 flex flex-col gap-2 border-l-4 border-spot pl-3" aria-label="Superset exercises">
                {group.map((g, k) => {
                  const r = stepResult(g, d.logs);
                  const cur = g.ref === step.ref;
                  return (
                    <li key={g.ref} className={cur ? "rounded-btn border-2 border-text bg-surface px-3 py-2" : "rounded-btn bg-surface px-3 py-2"}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-subhead font-bold">{String.fromCharCode(65 + k)} · {g.name}</span>
                        {r.kind === "done" ? <StatusTag kind="done">Done</StatusTag>
                          : <span className="font-num text-footnote font-bold tabular text-text-2">{r.kind === "partial" ? r.done : 0} of {g.sets} · {g.reps ?? "—"} reps</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          <div className="mt-3 flex items-start justify-between gap-3">
            <h1 className="text-title1 font-bold leading-tight">{step.name}</h1>
            {doneSets.length === 0 && !editing && (
              <DButton size="sm" variant="quiet" icon={<ArrowLeftRight className="size-4" aria-hidden />} onClick={openSwap}>Swap</DButton>
            )}
          </div>
          {step.name !== step.plannedName && <p className="mt-1 text-footnote text-text-2">Swapped for {step.plannedName} · this session only</p>}
          <p className="mt-2 text-body text-text-2">
            Plan: {step.sets} {group.length > 0 ? "rounds" : "sets"} × {step.reps ?? "—"} reps{step.load !== null ? ` at ${step.load} ${step.unit}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {editing ? <Chip icon={<Pencil className="size-4" aria-hidden />}>Changing set {editing.setNo}</Chip> : <Chip>Set {Math.min(setNo, step.sets)} of {step.sets}</Chip>}
          </div>
          <div className="mt-5"><SetPips total={step.sets} done={shownDone} current={editing ? editing.setNo : Math.min(setNo, step.sets)} onSelect={openEdit} /></div>
          {shownDone.length > 0 && !editing && <p className="mt-2 text-footnote text-text-2">Tap a done set to change it.</p>}
          <div className="mt-6 flex flex-col gap-5">
            <NumericInput label="Reps" value={vals.reps} onChange={(v) => setVals({ reps: Math.round(v) })} last={d.last[step.exerciseId]?.reps ?? null} />
            <div className="border-t border-line" />
            {vals.load === null ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-subhead text-text-2">No weight · bodyweight</p>
                <DButton size="sm" onClick={() => setVals({ load: d.last[step.exerciseId]?.load ?? 0 })}>Add weight</DButton>
              </div>
            ) : (
              <NumericInput label="Load" unit={step.unit} decimal step={2.5} value={vals.load} onChange={(v) => setVals({ load: v })} last={d.last[step.exerciseId]?.load ?? null} />
            )}
          </div>
          <fieldset className="mt-6">
            <legend className="text-subhead font-bold">Reps left in the tank <span className="font-normal text-text-2">· optional</span></legend>
            <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={vals.rir === n}
                  onClick={() => setVals({ rir: vals.rir === n ? null : n })}
                  className={vals.rir === n ? "press h-12 rounded-btn bg-text font-num text-headline font-bold text-bg" : "press h-12 rounded-btn border border-line bg-surface font-num text-headline font-bold"}>
                  {n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <StickyActions className="mt-6">
        {!resting && editing ? (
          <div className="grid grid-cols-2 gap-2">
            <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} onClick={() => void saveEdit()}>Save change</DButton>
            <DButton variant="secondary" size="log" onClick={() => setEditing(null)}>Cancel</DButton>
          </div>
        ) : !resting && (allDone ? (
          <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} onClick={() => end(false)}>Finish session</DButton>
        ) : (
          <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} disabled={!!pendingUndo} onClick={() => void logSet()}>Log set</DButton>
        ))}
        <DButton variant="quiet" size="md" className="mt-1 w-full" icon={<Hand className="size-5" aria-hidden />} onClick={() => setOffSheet(true)}>
          Something feels off
        </DButton>
      </StickyActions>

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title={`Swap ${step.name}`}>
        <p className="text-subhead text-text-2">For this session only. Your plan stays the same. Alternatives aren't matched to your equipment or limitations yet.</p>
        <div className="mt-4">
          {swapList === "loading" ? <ScreenState kind="loading" />
            : swapList === "offline" ? <ScreenState kind="offline" body="Exercises load once you're online." />
            : swapList === "failed" ? <ScreenState kind="failed" title="Couldn't load exercises" action={{ label: "Try again", onClick: openSwap }} />
            : (() => {
                const opts = swapList.filter((x) => x.id !== step.exerciseId);
                const planned = stepsOf(d.snapshot).find((s) => s.ref === step.ref);
                return (
                  <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
                    {planned && step.name !== step.plannedName && (
                      <li><DButton variant="secondary" size="md" className="w-full" onClick={() => swapTo(null)}>Back to {planned.name}</DButton></li>
                    )}
                    {opts.length === 0 && <li><ScreenState kind="empty" title="No other exercises yet" body="Exercises you add to a routine show up here." /></li>}
                    {opts.map((x) => (
                      <li key={x.id}><DButton variant="quiet" size="md" className="w-full justify-start" onClick={() => swapTo(x)}>{x.name}</DButton></li>
                    ))}
                  </ul>
                );
              })()}
        </div>
      </Sheet>

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
