import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Play } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import type { PipKind } from "@/lib/demo";
import { localDate } from "@/lib/workout";
import { blockMinutes, blockName, estimateMinutes, keptPositions, priorityPosition, whyThisTrade, type TimeChoice } from "@/lib/time-plan";
import { beginSession, getActiveSession, loadRoutine, loadWeek, type SessionDraft } from "@/lib/workout-store";
import { onOutboxChange } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { Banner, Card, ScreenState, VoiceBlock } from "@/components/dillan/surfaces";
import { BlockRow, CourseStrip, TimeControl } from "@/components/dillan/plan-pieces";
import { DButton } from "@/components/dillan/button";
import { DemoLabel, SaveState, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { StickyActions } from "@/components/dillan/overlays";
import { useNow } from "@/lib/timer";

export const Route = createFileRoute("/_authenticated/_app/today")({
  head: () => pageHead("Today", "Today's plan, how much time you have, and where to start."),
  component: Today,
});

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function weekDates(now = new Date()) {
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDate(d);
  });
}

function Today() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const outbox = useOutbox(user.id);
  const now = useNow(30000);
  const [time, setTime] = useState<TimeChoice>("full");
  const [active, setActive] = useState<SessionDraft | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const dates = useMemo(() => weekDates(), []);
  const today = localDate();

  const routine = useQuery({ queryKey: ["routine", user.id], queryFn: () => loadRoutine(user.id) });
  const week = useQuery({ queryKey: ["week", user.id, dates[0]], queryFn: () => loadWeek(user.id, dates[0]!, dates[6]!) });
  const goal = useQuery({
    queryKey: ["goal", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("title, user_words, is_demo")
        .eq("owner_id", user.id).eq("status", "active").is("archived_at", null).order("priority").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  useEffect(() => {
    const read = () => void getActiveSession(user.id).then(setActive).catch(() => setActive(null));
    read();
    return onOutboxChange(read);
  }, [user.id]);

  const r = routine.data;
  const minutes = useMemo(
    () => (r ? { full: estimateMinutes(r, "full"), short: estimateMinutes(r, "short"), priority: estimateMinutes(r, "priority") } : null),
    [r],
  );

  const start = async () => {
    if (!r || starting) return;
    setStarting(true);
    setStartFailed(false);
    try {
      const id = await beginSession(user.id, r, (k, p) => outbox.add(k, p), time);
      void navigate({ to: "/session/$id", params: { id } });
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  };

  const days: { day: string; kind: PipKind }[] = dates.map((date, i) => {
    if (date === today) return { day: DAY_LETTERS[i]!, kind: "today" };
    // Without this week's data we don't know what happened: never claim "nothing logged".
    if (!week.data) return { day: DAY_LETTERS[i]!, kind: "unknown" };
    const s = week.data?.filter((x) => x.local_date === date && x.completion !== "in_progress") ?? [];
    if (s.some((x) => x.completion === "complete" && !x.shortened)) return { day: DAY_LETTERS[i]!, kind: "done" };
    if (s.some((x) => x.shortened)) return { day: DAY_LETTERS[i]!, kind: "short" };
    if (s.length) return { day: DAY_LETTERS[i]!, kind: "partial" };
    return { day: DAY_LETTERS[i]!, kind: date < today ? "empty" : "planned" };
  });
  const strip = (
    <div>
      <CourseStrip days={days} />
      {week.isError && (
        <p className="mt-2 flex items-center gap-2 text-footnote text-text-2">
          <UnknownValue /> {navigator.onLine ? "Couldn't load this week." : "This week loads when you're online."}
        </p>
      )}
    </div>
  );

  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const kept = r ? new Set(keptPositions(r, time)) : new Set<number>();
  const prio = r ? priorityPosition(r) : undefined;
  const why = r ? whyThisTrade(r, time) : null;
  const startLabel = time === "full" || !minutes ? "Start session" : `Start ${minutes[time]}-min session`;
  const minIn = active ? Math.max(0, Math.round(((now || Date.now()) - active.startedAt) / 60000)) : 0;

  return (
    <div className="pt-6 lg:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-footnote font-bold uppercase tracking-wider text-text-2">
          {date}
        </p>
        <div className="flex items-center gap-2">
          {r?.isDemo && <DemoLabel />}
          {outbox.loaded && <SaveState state={outbox.state} count={outbox.pending + outbox.failed} onRetry={outbox.retryNow} />}
        </div>
      </div>
      <div className="mt-4 hidden lg:block lg:max-w-[480px]">{strip}</div>

      {routine.isPending ? (
        <div className="mt-6 flex flex-col gap-3" aria-busy="true" aria-label="Loading today's plan">
          <div className="h-16 animate-pulse rounded-card bg-surface-2" />
          <div className="h-10 animate-pulse rounded-card bg-surface-2" />
          <div className="h-56 animate-pulse rounded-card bg-surface-2" />
        </div>
      ) : routine.isError ? (
        <Card className="mt-6">
          <ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load today's plan" body="Check your connection and try again." action={{ label: "Try again", onClick: () => void routine.refetch() }} />
        </Card>
      ) : !r ? (
        <>
          <div className="mt-6 lg:hidden">{strip}</div>
          <Card className="mt-6">
            <ScreenState kind="empty" title="No routine yet" body="Add one in onboarding or your plan, and today's session shows up here." />
          </Card>
        </>
      ) : (
        <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="min-w-0">
            {r.purpose?.trim() && (
              <VoiceBlock className="mt-4 lg:mt-0" headline={r.purpose.trim()} source={`From your plan · v${r.versionNo}`} />
            )}
            <div className="mt-6 lg:hidden">{strip}</div>

            <Card className="mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-title2 font-bold">{r.title}</h2>
                <span className="text-footnote text-text-2">est. times</span>
              </div>
              {minutes && <TimeControl value={time} onChange={setTime} minutes={minutes} />}
              <ul className="mt-2">
                {[...r.blocks].sort((a, b) => a.position - b.position).map((b) => (
                  <BlockRow
                    key={b.position}
                    name={blockName(b)}
                    kind={b.position === prio ? "priority" : b.priority === "optional" ? "optional" : "required"}
                    {...(b.position === prio ? { tag: "Priority" } : {})}
                    exercises={b.blockType === "superset"
                      ? `Superset · ${b.rounds} rounds`
                      : b.prescriptions.map((p) => `${p.sets ?? b.rounds} × ${p.reps ?? "—"}${p.load != null ? ` @ ${p.load} ${p.unit ?? "lb"}` : ""}`).join(" · ")}
                    minutes={blockMinutes(b)}
                    omitted={!kept.has(b.position)}
                  />
                ))}
              </ul>
              {why && (
                <p className="mt-2 rounded-btn bg-surface-2 p-3 text-footnote text-text-2">
                  <span className="font-bold text-text">Why this trade: </span>{why}
                </p>
              )}
              <p className="mt-2 text-footnote text-text-2">Estimates include setup and rest. Your pace decides the real time.</p>
            </Card>

            {active ? (
              <Card className="mt-4 border-2 border-text">
                <StatusTag kind="waiting">In progress</StatusTag>
                <p className="mt-2 text-headline font-bold">{active.snapshot.title}</p>
                <div className="mt-3 flex flex-col gap-1 lg:max-w-[480px]">
                  <DButton variant="primary" icon={<Play className="size-5" aria-hidden />} onClick={() => navigate({ to: "/session/$id", params: { id: active.id } })}>
                    <span className="whitespace-nowrap">Resume session · {minIn} min in</span>
                  </DButton>
                  <DButton variant="quiet" size="md" className="w-full" onClick={() => navigate({ to: "/session/$id", params: { id: active.id }, search: { finish: true } })}>
                    Finish here
                  </DButton>
                </div>
              </Card>
            ) : (
              <StickyActions className="mt-4 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
                {startFailed && (
                  <Banner className="mb-2" icon={<CircleAlert className="size-5 shrink-0 text-text" aria-hidden />}>
                    Couldn't start on this device. Private mode or full storage can block it. Try again.
                  </Banner>
                )}
                <DButton
                  variant="primary"
                  icon={<Play className="size-5" aria-hidden />}
                  className="lg:max-w-[480px]"
                  loading={starting}
                  disabled={starting || active === undefined}
                  onClick={() => void start()}
                >
                  {startLabel}
                </DButton>
                <p className="mt-2 hidden text-footnote text-text-2 lg:block">
                  Logging on a phone? Open Dillan there and tap Train. Your session follows your account.
                </p>
              </StickyActions>
            )}
          </div>

          <aside className="mt-8 flex flex-col gap-3 lg:mt-0">
            <Card>
              <h2 className="text-headline font-bold">Waiting on you</h2>
              <p className="mt-1 text-subhead text-text-2">Nothing right now. Coach and Dillan proposals will show here, each with its status.</p>
            </Card>
            <Card>
              <p className="text-footnote font-bold uppercase tracking-wide text-text-2">Your goal</p>
              {goal.isPending ? (
                <div className="mt-2 h-12 animate-pulse rounded-btn bg-surface-2" aria-busy="true" aria-label="Loading your goal" />
              ) : goal.isError || !goal.data ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-subhead text-text-2">
                  {goal.isError ? <><UnknownValue /> Loads when you're online.</> : "No goal yet. Add one in your profile."}
                </p>
              ) : (
                <>
                  <h2 className="mt-1 text-headline font-bold">{goal.data.user_words || goal.data.title}</h2>
                  <p className="mt-1 flex items-center gap-2 text-subhead text-text-2">Progress <UnknownValue /></p>
                  {goal.data.is_demo && <DemoLabel className="mt-2" />}
                </>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
