import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check, ChevronLeft, Circle, Dumbbell, Infinity as InfinityIcon, Minus, PersonStanding, Plus,
  RectangleHorizontal, ShoppingBag, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { loadDraft, saveDraft } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import {
  EQUIPMENT_PRESETS, LIMITATION_AREAS, ONBOARDING_KIND, SIDED_AREAS, STEP_COUNT,
  buildOnboardingPayload, emptyAnswers, onboardedFlag, summarize,
  type EquipmentChoice, type OnboardingAnswers, type Side,
} from "@/lib/onboarding";
import { DButton } from "@/components/dillan/button";
import { Chip, SaveState, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { StickyActions } from "@/components/dillan/overlays";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => pageHead("Getting started", "Tell Dillan your goals, time, equipment and routine. Every question can wait."),
  component: Onboarding,
});

interface Draft {
  step: number; // 1–6 questions, 7 summary
  answers: OnboardingAnswers;
}

const GOAL_EXAMPLES = ["Get my first chin-up", "Stay strong as I age", "Feel less stiff", "Keep a steady routine"];
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const MINUTE_OPTIONS = [20, 30, 45, 60, 75];

const equipIcon: Record<string, ReactNode> = {
  adjustable_dumbbells: <Dumbbell className="size-6" aria-hidden />,
  pullup_bar: <Minus className="size-6" aria-hidden />,
  flat_bench: <RectangleHorizontal className="size-6" aria-hidden />,
  bands: <InfinityIcon className="size-6" aria-hidden />,
  kettlebell: <ShoppingBag className="size-6" aria-hidden />,
  bodyweight: <PersonStanding className="size-6" aria-hidden />,
};

const inputCls =
  "w-full rounded-btn border border-line bg-surface px-4 text-callout text-text placeholder:text-text-3 focus:border-text focus:outline-none";

function Onboarding() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const outbox = useOutbox(user.id);
  const key = `onboarding:${user.id}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [profileVersion, setProfileVersion] = useState<number>(1);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  useEffect(() => {
    void loadDraft<Draft>(key).then((d) => setDraft(d ?? { step: 1, answers: emptyAnswers() }));
    // New accounts start at version 1; if we're offline we keep that assumption and a
    // mismatch comes back as a conflict instead of overwriting.
    void supabase.from("profiles").select("version").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setProfileVersion(data.version);
    });
  }, [key, user.id]);

  const set = (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...(typeof patch === "function" ? patch(d) : patch) };
      void saveDraft(key, next);
      return next;
    });
  const answer = (patch: Partial<OnboardingAnswers>) => set((d) => ({ answers: { ...d.answers, ...patch } }));

  const payload = useMemo(() => (draft ? buildOnboardingPayload(draft.answers) : null), [draft]);

  if (!draft || !payload) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <SpotMark size={40} animate className="text-text" title="Loading" />
      </div>
    );
  }

  const a = draft.answers;
  const step = draft.step;
  const next = () => set({ step: Math.min(7, step + 1) });
  const back = () => set({ step: Math.max(1, step - 1) });

  const finish = async () => {
    const item = await outbox.add(ONBOARDING_KIND, payload, profileVersion);
    setSavedId(item.localId);
    localStorage.setItem(onboardedFlag(user.id), "1");
    void navigate({ to: "/today" });
  };

  const mine = outbox.items.find((i) => i.localId === savedId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-margin pt-[calc(var(--safe-t)+12px)]">
      <header className="flex h-14 items-center justify-between gap-3">
        {step > 1 ? (
          <button type="button" onClick={back} aria-label="Back" className="press grid size-11 place-items-center rounded-full bg-surface-2">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="size-11" />
        )}
        {step <= STEP_COUNT ? <ProgressDots step={step} /> : <span />}
        {step <= STEP_COUNT ? (
          <button type="button" onClick={next} className="press h-11 px-1 text-headline font-medium text-text-2">
            Later
          </button>
        ) : (
          <span className="size-11" />
        )}
      </header>

      <main className="flex-1 pb-6">
        {step === 1 && (
          <section className="flex flex-col items-center pt-16 text-center">
            <SpotMark size={88} animate className="text-text" />
            <h1 className="mt-8 font-voice text-voice-xl leading-tight">I'm Dillan, your gym coach.</h1>
            <p className="mt-3 font-voice text-voice text-text-2">
              I'll help you train with purpose and stay steady. A few quick questions. Any of them can wait.
            </p>
          </section>
        )}

        {step === 2 && (
          <Question title="What do you want training to do for you?" sub="Say it your way. You can split it into up to three goals.">
            <textarea
              value={a.goalWords}
              onChange={(e) => answer({ goalWords: e.target.value, goals: a.goals.length ? a.goals : [] })}
              rows={3}
              maxLength={1000}
              placeholder="e.g. I want to do a chin-up and stop my back hurting after work"
              className={cn(inputCls, "py-3")}
              aria-label="Your goals in your words"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {GOAL_EXAMPLES.map((g) => (
                <Chip key={g} small onClick={() => answer({ goalWords: a.goalWords ? `${a.goalWords.trim()}. ${g}` : g })}>
                  {g}
                </Chip>
              ))}
            </div>
            {a.goalWords.trim() && (
              <div className="mt-6">
                <h2 className="text-subhead font-bold">Your goals, as you'd put them</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {(a.goals.length ? a.goals : [a.goalWords.trim()]).map((g, i, arr) => (
                    <li key={i} className="flex items-center gap-2">
                      <input
                        value={g}
                        maxLength={200}
                        aria-label={`Goal ${i + 1}`}
                        onChange={(e) => {
                          const list = [...arr];
                          list[i] = e.target.value;
                          answer({ goals: list });
                        }}
                        className={cn(inputCls, "h-12")}
                      />
                      {arr.length > 1 && (
                        <button type="button" aria-label={`Remove goal ${i + 1}`} className="press grid size-11 shrink-0 place-items-center rounded-full bg-surface-2"
                          onClick={() => answer({ goals: arr.filter((_, j) => j !== i) })}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {(a.goals.length || 1) < 3 && (
                  <DButton variant="quiet" size="md" className="mt-2 px-0" icon={<Plus className="size-4" aria-hidden />}
                    onClick={() => answer({ goals: [...(a.goals.length ? a.goals : [a.goalWords.trim()]), ""] })}>
                    Add another goal
                  </DButton>
                )}
              </div>
            )}
          </Question>
        )}

        {step === 3 && (
          <Question title="How much time do you usually have?" sub="Rough is fine. Short days still count.">
            <h2 className="text-subhead font-bold">Days per week</h2>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Days per week">
              {DAY_OPTIONS.map((n) => (
                <Chip key={n} role="radio" aria-checked={a.daysPerWeek === n} selected={a.daysPerWeek === n}
                  className="min-w-12 justify-center font-num" onClick={() => answer({ daysPerWeek: a.daysPerWeek === n ? null : n })}>
                  {n}
                </Chip>
              ))}
            </div>
            <h2 className="mt-6 text-subhead font-bold">A typical full session</h2>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Minutes per session">
              {MINUTE_OPTIONS.map((n) => (
                <Chip key={n} role="radio" aria-checked={a.sessionMinutes === n} selected={a.sessionMinutes === n}
                  onClick={() => answer({ sessionMinutes: a.sessionMinutes === n ? null : n })}>
                  <span className="font-num">{n}</span> min
                </Chip>
              ))}
            </div>
            {a.sessionMinutes !== null && (
              <p className="mt-3 text-footnote text-text-2">
                Full is about <span className="font-num">{a.sessionMinutes}</span> min. On busy days you can pick Short, about{" "}
                <span className="font-num">{Math.round(a.sessionMinutes / 2 / 5) * 5}</span> min.
              </p>
            )}
          </Question>
        )}

        {step === 4 && (
          <Question title="What's actually in your gym?" sub="I'll only plan around what you have. You can change this anytime.">
            <div className="grid grid-cols-2 gap-3">
              {[...EQUIPMENT_PRESETS, ...a.equipment.filter((e) => e.type === "other")].map((e) => {
                const on = a.equipment.some((x) => x.key === e.key);
                return (
                  <button key={e.key} type="button" aria-pressed={on}
                    onClick={() => answer({
                      equipmentUnsure: false,
                      equipment: on ? a.equipment.filter((x) => x.key !== e.key) : [...a.equipment, e],
                    })}
                    className={cn("press relative flex min-h-[120px] flex-col items-start rounded-card p-4 text-left",
                      on ? "border-2 border-text bg-surface" : "border border-line bg-surface")}>
                    <span className={on ? "text-text" : "text-text-2"}>{equipIcon[e.type] ?? <Circle className="size-6" aria-hidden />}</span>
                    {on && <StatusTag kind="done" className="absolute right-3 top-3">Have it</StatusTag>}
                    <span className="mt-3 text-headline font-bold leading-tight">{e.label}</span>
                    <span className="mt-0.5 text-subhead text-text-2">{on ? e.detail : "Tap to add"}</span>
                  </button>
                );
              })}
              <div className="flex min-h-[120px] flex-col rounded-card border border-dashed border-line p-4">
                <Plus className="size-6 text-text-2" aria-hidden />
                <label className="mt-3 text-headline font-bold" htmlFor="other-equip">Something else</label>
                <div className="mt-1 flex gap-1">
                  <input id="other-equip" value={otherText} maxLength={80} onChange={(e) => setOtherText(e.target.value)}
                    placeholder="Describe it" className="h-10 w-full min-w-0 rounded-md border-0 bg-transparent text-callout placeholder:text-text-3 focus:outline-none" />
                  {otherText.trim() && (
                    <button type="button" aria-label="Add this equipment" className="press grid size-10 shrink-0 place-items-center rounded-full bg-surface-2"
                      onClick={() => {
                        const item: EquipmentChoice = { key: `other-${Date.now()}`, type: "other", label: otherText.trim(), detail: "Added by you", quantity: 1 };
                        answer({ equipmentUnsure: false, equipment: [...a.equipment, item] });
                        setOtherText("");
                      }}>
                      <Check className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Question>
        )}

        {step === 5 && (
          <Question title="Anything to work around?" sub="An old injury, a sore joint, anything you'd rather go easy on. This is a note for planning, not a diagnosis.">
            <div className="flex flex-wrap gap-2">
              {LIMITATION_AREAS.map((area) => {
                const on = a.limitations.some((l) => l.area === area);
                return (
                  <Chip key={area} selected={on} onClick={() => answer({
                    limitationsAnswer: "listed",
                    limitations: on ? a.limitations.filter((l) => l.area !== area) : [...a.limitations, { area, side: null }],
                  })}>
                    {area}
                  </Chip>
                );
              })}
            </div>
            {a.limitationsAnswer === "listed" && a.limitations.filter((l) => SIDED_AREAS.has(l.area)).map((l) => (
              <div key={l.area} className="mt-4">
                <p className="text-subhead font-bold">{l.area}: which side?</p>
                <div className="mt-2 flex gap-2" role="radiogroup" aria-label={`${l.area} side`}>
                  {(["left", "right", "both"] as Side[]).map((s) => (
                    <Chip key={s} small role="radio" aria-checked={l.side === s} selected={l.side === s}
                      onClick={() => answer({ limitations: a.limitations.map((x) => (x.area === l.area ? { ...x, side: x.side === s ? null : s } : x)) })}>
                      {s[0]!.toUpperCase() + s.slice(1)}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-6 flex flex-col gap-2">
              <Chip selected={a.limitationsAnswer === "none_known"} className="h-11 justify-center"
                onClick={() => answer({ limitationsAnswer: a.limitationsAnswer === "none_known" ? null : "none_known", limitations: [] })}>
                Nothing I know of
              </Chip>
              <Chip selected={a.limitationsAnswer === "prefer_not"} className="h-11 justify-center"
                onClick={() => answer({ limitationsAnswer: a.limitationsAnswer === "prefer_not" ? null : "prefer_not", limitations: [] })}>
                Prefer not to say
              </Chip>
            </div>
          </Question>
        )}

        {step === 6 && (
          <Question title="What do you already do?" sub="If you have a routine, I'll take it as it is. Nothing gets replaced.">
            {a.routineMode !== "own" ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-card border border-dashed border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-headline font-bold">Build one with Dillan</p>
                    <StatusTag kind="neutral">Coming later</StatusTag>
                  </div>
                  <p className="mt-1 text-subhead text-text-2">Not ready yet. Until then you can start with the demo routine.</p>
                </div>
                <DButton variant="outline" size="md"
                  aria-pressed={a.routineMode === "demo"}
                  icon={a.routineMode === "demo" ? <Check className="size-4" aria-hidden /> : undefined}
                  onClick={() => answer({ routineMode: a.routineMode === "demo" ? null : "demo" })}>
                  Start with the demo routine
                </DButton>
              </div>
            ) : (
              <RoutineEditor a={a} answer={answer} />
            )}
          </Question>
        )}

        {step === 7 && (
          <section className="pt-4">
            <h1 className="font-voice text-voice-xl leading-tight">Here's what I know and what I don't yet.</h1>
            <p className="mt-2 font-voice text-voice text-text-2">Gaps are fine. We'll fill them in as you train.</p>
            <ul className="mt-6 divide-y divide-line rounded-card border border-line bg-surface">
              {summarize(payload).map((row) => (
                <li key={row.label} className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-footnote font-bold uppercase tracking-wider text-text-2">{row.label}</span>
                  {row.value ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusTag kind="done">Known</StatusTag>
                      <span className="text-body">{row.value}</span>
                    </span>
                  ) : (
                    <UnknownValue />
                  )}
                </li>
              ))}
            </ul>
            {!payload.routine && (
              <p className="mt-3 text-footnote text-text-2">You'll start with the demo routine. It's synthetic and labeled "Demo".</p>
            )}
            {mine && <SaveState className="mt-3" state={mine.status === "synced" ? "synced" : mine.status === "local" ? "local" : "failed"} onRetry={outbox.syncNow} />}
          </section>
        )}
      </main>

      <StickyActions>
        {step === 1 && <DButton variant="primary" onClick={next}>Start</DButton>}
        {step >= 2 && step <= 5 && <DButton variant="primary" onClick={next}>Continue</DButton>}
        {step === 6 && a.routineMode !== "own" && (
          <DButton variant="primary" onClick={() => answer({ routineMode: "own" })}>Enter what I already do</DButton>
        )}
        {step === 6 && a.routineMode === "own" && <DButton variant="primary" onClick={next}>Continue</DButton>}
        {step === 7 && <DButton variant="primary" onClick={finish}>Start first session</DButton>}
        {step >= 2 && step <= STEP_COUNT && (
          <DButton variant="quiet" size="md" className="mt-1 w-full" onClick={() => {
            if (step === 2) answer({ goalWords: "", goals: [] });
            if (step === 3) answer({ daysPerWeek: null, sessionMinutes: null });
            if (step === 4) answer({ equipment: [], equipmentUnsure: true });
            if (step === 5) answer({ limitations: [], limitationsAnswer: null });
            if (step === 6) {
              if (a.routineMode === "own") return answer({ routineMode: null });
              answer({ routineMode: null });
            }
            next();
          }}>
            {step === 6 && a.routineMode === "own" ? "Back to options" : "I'm not sure yet"}
          </DButton>
        )}
      </StickyActions>
    </div>
  );
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Question ${step} of ${STEP_COUNT}`}>
      {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
        <span key={n} className={cn("h-2.5 rounded-full",
          n < step ? "w-2.5 bg-text" : n === step ? "w-8 bg-spot" : "w-2.5 bg-surface-2")} />
      ))}
    </div>
  );
}

function Question({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="pt-4">
      <h1 className="font-voice text-voice-xl leading-tight">{title}</h1>
      <p className="mt-2 font-voice text-voice text-text-2">{sub}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function RoutineEditor({ a, answer }: { a: OnboardingAnswers; answer: (p: Partial<OnboardingAnswers>) => void }) {
  const rows = a.routineRows;
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    answer({ routineRows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div>
      <label className="text-subhead font-bold" htmlFor="routine-name">Routine name</label>
      <input id="routine-name" value={a.routineName} maxLength={80} placeholder="e.g. Pull + Core"
        onChange={(e) => answer({ routineName: e.target.value })} className={cn(inputCls, "mt-2 h-12")} />
      <p className="mt-5 text-subhead font-bold">Exercises</p>
      <p className="text-footnote text-text-2">Leave a number blank if it varies. Weight in lb.</p>
      <ol className="mt-3 flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={i} className="rounded-card border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <input value={r.name} maxLength={80} placeholder={`Exercise ${i + 1}`} aria-label={`Exercise ${i + 1} name`}
                onChange={(e) => setRow(i, { name: e.target.value })} className={cn(inputCls, "h-12")} />
              {rows.length > 1 && (
                <button type="button" aria-label={`Remove exercise ${i + 1}`} className="press grid size-11 shrink-0 place-items-center rounded-full bg-surface-2"
                  onClick={() => answer({ routineRows: rows.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["sets", "reps", "load"] as const).map((f) => (
                <label key={f} className="flex flex-col text-footnote text-text-2">
                  {f === "load" ? "Weight" : f[0]!.toUpperCase() + f.slice(1)}
                  <input value={r[f]} inputMode={f === "load" ? "decimal" : "numeric"} maxLength={6} placeholder="—"
                    onChange={(e) => setRow(i, { [f]: e.target.value })}
                    className={cn(inputCls, "mt-1 h-12 px-3 font-num")} />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < 30 && (
        <DButton variant="quiet" size="md" className="mt-2 px-0" icon={<Plus className="size-4" aria-hidden />}
          onClick={() => answer({ routineRows: [...rows, { name: "", sets: "", reps: "", load: "" }] })}>
          Add exercise
        </DButton>
      )}
    </div>
  );
}
