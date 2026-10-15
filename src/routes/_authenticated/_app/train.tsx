import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, List, PencilLine, Play } from "lucide-react";
import { pageHead } from "@/lib/head";
import { Card, OptionRow, PageHeader, SectionLabel, ScreenState } from "@/components/dillan/surfaces";
import { DemoLabel, SaveState, StatusTag } from "@/components/dillan/tags";
import { DButton } from "@/components/dillan/button";
import { useOutbox } from "@/lib/use-outbox";
import { onOutboxChange } from "@/lib/outbox";
import { beginSession, getActiveSession, loadRecent, loadRoutine, type SessionDraft } from "@/lib/workout.client";
import { stepsOf } from "@/lib/workout";

export const Route = createFileRoute("/_authenticated/_app/train")({
  head: () => pageHead("Train", "Resume a session, start today's, or see what you did recently."),
  component: Train,
});

const time = (iso: string | number) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Train() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const outbox = useOutbox(user.id);
  const routine = useQuery({ queryKey: ["routine", user.id], queryFn: () => loadRoutine(user.id) });
  const recent = useQuery({ queryKey: ["recent", user.id], queryFn: () => loadRecent(user.id) });
  const [active, setActive] = useState<SessionDraft | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const read = () => void getActiveSession(user.id).then(setActive);
    read();
    return onOutboxChange(read);
  }, [user.id]);

  const start = async () => {
    if (!routine.data) return;
    setStarting(true);
    try {
      const id = await beginSession(user.id, routine.data, (k, p) => outbox.add(k, p));
      void navigate({ to: "/session/$id", params: { id } });
    } finally {
      setStarting(false);
    }
  };

  const r = routine.data;
  const steps = r ? stepsOf(r) : [];
  const totalSets = steps.reduce((n, s) => n + s.sets, 0);
  const activeSteps = active ? stepsOf(active.snapshot) : [];
  const sessionItems = active ? outbox.items.filter((i) => (i.payload as { sessionId?: string; id?: string })?.sessionId === active.id || (i.payload as { id?: string })?.id === active.id) : [];
  const activeSave = sessionItems.some((i) => i.status === "failed" || i.status === "conflict") ? "failed" : sessionItems.some((i) => i.status === "local") ? "local" : "synced";

  return (
    <div>
      <PageHeader title="Train" />

      {active && (
        <Card className="mt-6 border-2 border-text">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusTag kind="waiting">In progress</StatusTag>
            <SaveState state={activeSave} onRetry={outbox.syncNow} />
          </div>
          <h2 className="mt-3 text-title2 font-bold">{active.snapshot.title}</h2>
          {active.snapshot.isDemo && <DemoLabel className="mt-1" />}
          <p className="mt-1 text-subhead text-text-2">
            Started {time(active.startedAt)} · {active.logs.length} of {activeSteps.reduce((n, s) => n + s.sets, 0)} sets logged
            {activeSteps[active.stepIndex] ? ` · you were on ${activeSteps[active.stepIndex]?.name.toLowerCase()}` : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <DButton variant="primary" icon={<Play className="size-5" aria-hidden />} onClick={() => navigate({ to: "/session/$id", params: { id: active.id } })}>
              Resume
            </DButton>
            <DButton variant="secondary" onClick={() => navigate({ to: "/session/$id", params: { id: active.id }, search: { finish: true } })}>
              Finish here
            </DButton>
          </div>
        </Card>
      )}

      <SectionLabel>{active ? "Other ways to train" : "Start training"}</SectionLabel>
      {routine.isPending ? (
        <Card><ScreenState kind="loading" /></Card>
      ) : routine.isError ? (
        <Card><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load your routine" body="Check your connection and try again." action={{ label: "Try again", onClick: () => void routine.refetch() }} /></Card>
      ) : !r ? (
        <Card><ScreenState kind="empty" title="No routine yet" body="Add one in onboarding or your plan, and it shows up here." /></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {!active && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-title2 font-bold">{r.title}</h2>
                {r.isDemo && <DemoLabel />}
              </div>
              <p className="mt-1 text-subhead text-text-2">{steps.length} exercises · {totalSets} sets · plan v{r.versionNo}</p>
              <ul className="mt-3 flex flex-col gap-1 text-subhead">
                {steps.map((s) => (
                  <li key={s.ref}>{s.name} <span className="text-text-2">· {s.sets} × {s.reps ?? "—"}{s.load !== null ? ` @ ${s.load} ${s.unit}` : ""}</span></li>
                ))}
              </ul>
              <DButton variant="primary" className="mt-4" icon={<Play className="size-5" aria-hidden />} loading={starting} onClick={start}>
                Start session
              </DButton>
            </Card>
          )}
          <OptionRow icon={<CalendarCheck className="size-6" aria-hidden />} title="Today's session" detail="Full · Short · Priority only comes with Today" onClick={() => navigate({ to: "/today" })} />
          <OptionRow icon={<List className="size-6" aria-hidden />} title="Pick a routine" detail="Comes later" />
          <OptionRow icon={<PencilLine className="size-6" aria-hidden />} title="Log something I already did" detail="Comes later" />
        </div>
      )}

      <SectionLabel>Recent</SectionLabel>
      <Card>
        {recent.isPending ? (
          <ScreenState kind="loading" />
        ) : recent.isError ? (
          <ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load recent sessions" body="Your sessions are safe. Try again when you're online." action={{ label: "Try again", onClick: () => void recent.refetch() }} />
        ) : recent.data.length === 0 ? (
          <ScreenState kind="empty" title="No sessions yet" body="Sessions you finish show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {recent.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-headline font-bold">{s.title}</p>
                  <p className="text-footnote text-text-2">
                    {new Date(s.started_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · {s.sets} sets
                  </p>
                </div>
                <StatusTag kind={s.completion === "complete" ? "done" : "neutral"}>
                  {s.completion === "complete" ? "Done" : s.completion === "stopped" ? "Stopped early" : "Partial"}
                </StatusTag>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
