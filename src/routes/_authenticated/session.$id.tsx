import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, CircleHelp, Hand, MoreHorizontal, PlayCircle, Repeat2 } from "lucide-react";
import { pageHead } from "@/lib/head";
import { demoSet } from "@/lib/demo";
import { loadDraft, saveDraft } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { elapsedMs, formatClock, remainingMs, useNow, useWakeLock } from "@/lib/timer";
import { DButton } from "@/components/dillan/button";
import { Chip, DemoLabel, SaveState, StatusTag } from "@/components/dillan/tags";
import { NumericInput, RestTimer, SetPips } from "@/components/dillan/training-pieces";
import { Sheet, StickyActions, useToast } from "@/components/dillan/overlays";
import { SpotMark } from "@/components/dillan/spot-mark";

export const Route = createFileRoute("/_authenticated/session/$id")({
  head: () => pageHead("Session", "Your training session."),
  component: Session,
});

interface Draft {
  startedAt: number;
  done: number[];
  restStartedAt: number | null;
  reps: number;
  load: number;
  rir: number | null;
}

function Session() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const toast = useToast();
  const outbox = useOutbox(user.id);
  const now = useNow(250);
  useWakeLock(true);
  const key = `session:${user.id}:${id}`;
  const s = demoSet;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [offSheet, setOffSheet] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    void loadDraft<Draft>(key).then((d) =>
      setDraft(d ?? { startedAt: Date.now(), done: [1], restStartedAt: null, reps: s.reps, load: s.load, rir: 2 }),
    );
  }, [key, s.reps, s.load]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      void saveDraft(key, next);
      return next;
    });
  };

  if (!draft) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <SpotMark size={40} animate className="text-text" title="Loading session" />
      </div>
    );
  }

  const current = Math.min(s.sets, Math.max(0, ...draft.done) + 1);
  const restLeft = draft.restStartedAt ? remainingMs(draft.restStartedAt, s.restSeconds * 1000, now) : 0;
  const resting = draft.restStartedAt !== null && restLeft > 0;
  const myItem = outbox.items.find((i) => i.localId === lastSaved);
  const saveState = myItem
    ? myItem.status === "synced"
      ? "synced"
      : myItem.status === "local"
        ? "local"
        : "failed"
    : outbox.state;

  const logSet = async () => {
    const t0 = performance.now();
    const item = await outbox.add("set_log", {
      sessionId: id,
      exercise: s.exercise,
      set: current,
      reps: draft.reps,
      load: draft.load,
      unit: s.unit,
      rir: draft.rir,
      loggedAt: new Date().toISOString(),
      demo: true,
    });
    setLastSaved(item.localId);
    update({ done: [...draft.done, current], restStartedAt: Date.now() });
    const ms = Math.round(performance.now() - t0);
    toast({ text: `Set ${current} logged · saved on this device in ${ms} ms`, undo: () => update({ done: draft.done, restStartedAt: null }) });
  };

  const end = () => navigate({ to: "/train" });

  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-margin pt-[calc(var(--safe-t)+12px)]">
      {/* Run bar: End is always one tap, no confirmation */}
      <header className="flex items-center justify-between gap-3">
        <DButton variant="secondary" size="md" onClick={end}>End</DButton>
        <div className="text-center">
          <p className="text-subhead font-bold text-text-2">Pull + Core</p>
          <p className="font-num text-title2 font-extrabold tabular" aria-label="Elapsed time">{formatClock(elapsedMs(draft.startedAt, now || draft.startedAt))}</p>
        </div>
        <button type="button" aria-label="More options" className="press grid size-11 place-items-center rounded-full bg-surface-2">
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </header>
      <div className="mt-4 grid grid-cols-5 gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i < 2 ? "h-1 rounded-full bg-text" : i === 2 ? "h-1 rounded-full bg-spot" : "h-1 rounded-full bg-surface-2"} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusTag kind="priority" icon={false}>{s.block}</StatusTag>
        <span className="text-subhead font-medium text-text-2">Exercise {s.index} of {s.of}</span>
        <span className="ml-auto"><SaveState state={saveState} onRetry={outbox.syncNow} /></span>
      </div>
      <div className="mt-2"><DemoLabel /></div>

      {resting ? (
        <section className="flex flex-1 flex-col items-center justify-center py-8">
          <p className="mb-6 text-headline font-bold">Rest</p>
          <RestTimer remainingMs={restLeft} totalMs={s.restSeconds * 1000} />
          <p className="mt-6 text-subhead text-text-2">Next: set {current} of {s.exercise.toLowerCase()}</p>
          <DButton variant="secondary" size="md" className="mt-6" onClick={() => update({ restStartedAt: null })}>Skip rest</DButton>
        </section>
      ) : (
        <section className="flex-1">
          <h1 className="mt-3 text-title1 font-bold leading-tight">{s.exercise}</h1>
          <p className="mt-2 text-body text-text-2">{s.cue}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip icon={<CircleHelp className="size-4" aria-hidden />}>Why this?</Chip>
            <Chip icon={<Repeat2 className="size-4" aria-hidden />}>Swap</Chip>
            <Chip icon={<PlayCircle className="size-4" aria-hidden />}>How-to</Chip>
          </div>
          <div className="mt-5">
            <SetPips total={s.sets} done={draft.done} current={current} />
          </div>
          <div className="mt-6 flex flex-col gap-5">
            <NumericInput label="Reps" value={draft.reps} onChange={(v) => update({ reps: v })} last={s.lastReps} />
            <div className="border-t border-line" />
            <NumericInput label="Per dumbbell" unit={s.unit} decimal step={5} value={draft.load} onChange={(v) => update({ load: v })} last={s.lastLoad} />
          </div>
          <fieldset className="mt-6">
            <legend className="text-subhead font-bold">Reps left in the tank <span className="font-normal text-text-2">· optional</span></legend>
            <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={draft.rir === n}
                  onClick={() => update({ rir: draft.rir === n ? null : n })}
                  className={draft.rir === n ? "press h-12 rounded-btn bg-text font-num text-headline font-bold text-bg" : "press h-12 rounded-btn border border-line bg-surface font-num text-headline font-bold"}
                >
                  {n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <StickyActions className="mt-6">
        {!resting && (
          <DButton variant="primary" size="log" icon={<Check className="size-6" aria-hidden />} onClick={logSet} disabled={draft.done.includes(s.sets)}>
            {draft.done.includes(s.sets) ? "All sets logged" : "Log set"}
          </DButton>
        )}
        <DButton variant="quiet" size="md" className="mt-1 w-full" icon={<Hand className="size-5" aria-hidden />} onClick={() => setOffSheet(true)}>
          Something feels off
        </DButton>
      </StickyActions>

      <Sheet open={offSheet} onClose={() => setOffSheet(false)} title="Something feels off">
        <p className="font-voice text-voice text-text">Thanks for telling me. You can stop right now, and what you did still counts.</p>
        <div className="mt-5 flex flex-col gap-2">
          <DButton variant="secondary" onClick={end}>Stop the session here</DButton>
          <DButton variant="quiet" size="md" onClick={() => setOffSheet(false)}>Keep going, lighter</DButton>
        </div>
      </Sheet>
    </div>
  );
}
