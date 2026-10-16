import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Lock, PencilLine } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import { loadRoutine, planDraftKey } from "@/lib/workout-store";
import { useToast } from "@/components/dillan/overlays";
import { deleteDraft, onOutboxChange, removeIfLocal, type OutboxItem } from "@/lib/outbox";
import { versionInUse } from "@/lib/conflicts";
import { rebaseRoutineSave } from "@/lib/conflicts.client";
import { useOutbox } from "@/lib/use-outbox";
import { estimateMinutes, blockName } from "@/lib/time-plan";
import { GOAL_LEVEL, GOAL_LEVELS, LEVEL_LABEL, ROUTINE_SAVE, type GoalLevel, type RoutineSavePayload } from "@/lib/plan";
import { Card, PageHeader, ScreenState, SectionLabel, VoiceBlock } from "@/components/dillan/surfaces";
import { DButton } from "@/components/dillan/button";
import { Chip, DemoLabel, SaveState, StatusTag, UnknownValue } from "@/components/dillan/tags";
import { BlockDot } from "@/components/dillan/plan-pieces";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/plan/")({
  head: () => pageHead("Plan", "Your active routine, its versions, and your goal levels."),
  component: Plan,
});

const Skeleton = ({ h = "h-32" }: { h?: string }) => <div className={cn("animate-pulse rounded-card bg-surface-2", h)} aria-busy="true" aria-label="Loading" />;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Plan() {
  const { user } = Route.useRouteContext();
  const outbox = useOutbox(user.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const routine = useQuery({ queryKey: ["routine", user.id], queryFn: () => loadRoutine(user.id) });
  const r = routine.data;
  const versions = useQuery({
    queryKey: ["versions", user.id, r?.routineId],
    enabled: !!r,
    queryFn: async () => {
      const { data, error } = await supabase.from("routine_template_versions").select("id, version_no, created_at, locked_at, title")
        .eq("owner_id", user.id).eq("routine_id", r!.routineId).is("archived_at", null).order("version_no", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const goals = useQuery({
    queryKey: ["plan-goals", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("id, title, user_words, level, version, is_demo")
        .eq("owner_id", user.id).eq("status", "active").is("archived_at", null).order("priority");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => onOutboxChange(() => {
    void qc.invalidateQueries({ queryKey: ["plan-goals", user.id] });
    void qc.invalidateQueries({ queryKey: ["versions", user.id] });
  }), [qc, user.id]);

  // Level changes still on this device show right away, with their save word.
  const pendingLevel = (id: string) => outbox.items.filter((i) => i.kind === GOAL_LEVEL && i.status !== "synced" && (i.payload as { id: string }).id === id).at(-1);
  const busy = useRef(false);
  const setLevel = async (g: { id: string; version: number }, level: GoalLevel) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const prev = pendingLevel(g.id);
      let expected = g.version;
      if (prev && prev.status === "local") {
        // Replace the unsent change; it read the same version. If it's already sending, the next version follows it.
        expected = (await removeIfLocal(prev.localId)) ? (prev.expectedVersion ?? g.version) : (prev.expectedVersion ?? g.version) + 1;
      }
      await outbox.add(GOAL_LEVEL, { id: g.id, level }, expected);
    } catch {
      toast({ text: "Couldn't save on this device. Nothing changed." });
    } finally {
      busy.current = false;
    }
  };

  const discardSave = async (i: OutboxItem) => {
    if (versionInUse(outbox.items, (i.payload as RoutineSavePayload).id)) {
      toast({ text: "A session you started on this version hasn't synced yet, so this save has to stay until it does." });
      return;
    }
    try {
      if (!(await removeIfLocal(i.localId))) return;
      await deleteDraft(planDraftKey(user.id));
      await qc.invalidateQueries({ queryKey: ["routine", user.id] });
    } catch { toast({ text: "Couldn't change this device's copy. Try again." }); }
  };
  const keepEditing = async (i: OutboxItem) => {
    try {
      // Draft first, then take the save back, so nothing is lost if the second step fails.
      if (!(await rebaseRoutineSave(i))) return;
      await qc.invalidateQueries({ queryKey: ["routine", user.id] });
      void navigate({ to: "/plan/edit" });
    } catch { toast({ text: "Couldn't change this device's copy. Try again." }); }
  };
  const pendingSave = outbox.items.filter((i) => i.kind === ROUTINE_SAVE && i.status !== "synced");

  return (
    <div className="pb-10">
      <PageHeader title="Plan" trailing={outbox.loaded ? <SaveState state={outbox.state} count={outbox.pending + outbox.failed} onRetry={outbox.retryNow} className="mt-2" /> : undefined} />

      <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          {routine.isPending ? <Skeleton h="h-48" /> : routine.isError ? (
            <Card><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load your routine" body="Check your connection and try again." action={{ label: "Try again", onClick: () => void routine.refetch() }} /></Card>
          ) : !r ? (
            <Card><ScreenState kind="empty" title="No routine yet" body="Add one in onboarding and it shows here." /></Card>
          ) : (
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag kind="done">In use</StatusTag>
                <span className="text-footnote text-text-2">Version {r.versionNo}</span>
                {r.isDemo && <DemoLabel />}
              </div>
              <h2 className="mt-3 text-title2 font-bold">{r.title}</h2>
              <p className="mt-1 text-subhead text-text-2">
                {r.blocks.length} block{r.blocks.length === 1 ? "" : "s"} · about <span className="font-num">{estimateMinutes(r, "full")}</span> min (estimate)
              </p>
              <ul className="mt-3">
                {[...r.blocks].sort((a, b) => a.position - b.position).map((b) => (
                  <li key={b.position} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                    <BlockDot kind={b.priority === "priority" ? "priority" : b.priority === "optional" ? "optional" : "required"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-headline font-bold">{blockName(b)}</p>
                      <p className="text-footnote text-text-2">
                        {b.priority === "priority" ? "Priority" : b.priority === "optional" ? "Optional" : "Required"}
                        {b.blockType === "superset" ? ` · superset · ${b.rounds} rounds` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <DButton variant="primary" className="mt-4 lg:max-w-[320px]" icon={<PencilLine className="size-5" aria-hidden />} onClick={() => navigate({ to: "/plan/edit" })}>
                Edit routine
              </DButton>
            </Card>
          )}

          <SectionLabel>How this plan works</SectionLabel>
          {r?.purpose?.trim() ? (
            <VoiceBlock size="body" headline={r.purpose.trim()} source={`From your plan · v${r.versionNo}`} />
          ) : (
            <Card><p className="flex flex-wrap items-center gap-2 text-subhead text-text-2"><UnknownValue />Why this plan is built this way isn't written down yet.</p></Card>
          )}

          <SectionLabel>Exercises in this routine</SectionLabel>
          {r && r.blocks.length ? (
            <Card className="p-0">
              <ul>
                {r.blocks.flatMap((b) => b.prescriptions).filter((p, i, a) => p.exercise_id && a.findIndex((q) => q.exercise_id === p.exercise_id) === i).map((p) => (
                  <li key={p.exercise_id} className="border-b border-line last:border-b-0">
                    <Link to="/plan/exercise/$id" params={{ id: p.exercise_id }} className="press flex min-h-14 items-center gap-3 px-4 py-3">
                      <BookOpen className="size-5 shrink-0 text-text-2" aria-hidden />
                      <span className="flex-1 text-headline font-bold">{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : <Card><p className="text-subhead text-text-2">No exercises yet.</p></Card>}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <SectionLabel>Versions</SectionLabel>
            <Card className="p-0">
              {pendingSave.map((i) => {
                const p = i.payload as RoutineSavePayload;
                return (
                  <div key={i.localId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <span className="text-headline font-bold">v{p.baseVersionNo + 1}</span>
                    <SaveState state={i.status === "local" ? "local" : "failed"} onRetry={outbox.retryNow} />
                    {i.status !== "local" && (
                      <div className="flex w-full flex-col gap-2 min-[400px]:flex-row">
                        <DButton variant="secondary" size="md" onClick={() => void keepEditing(i)}>Keep editing</DButton>
                        <DButton variant="quiet" size="md" onClick={() => void discardSave(i)}>Discard this save</DButton>
                      </div>
                    )}
                  </div>
                );
              })}
              {versions.isPending && r ? <div className="p-4"><Skeleton h="h-16" /></div> : versions.isError ? (
                <p className="p-4 text-subhead text-text-2">{navigator.onLine ? "Couldn't load versions." : "Versions load when you're online."}</p>
              ) : (versions.data ?? []).filter((v) => !pendingSave.some((i) => (i.payload as RoutineSavePayload).id === v.id)).map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
                  <div>
                    <span className="text-headline font-bold">v{v.version_no}</span>
                    <span className="ml-2 text-footnote text-text-2">{fmtDate(v.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {v.id === r?.templateVersionId && <StatusTag kind="done">In use</StatusTag>}
                    {v.locked_at && <StatusTag kind="neutral" icon={<Lock className="size-3.5" aria-hidden />}>Locked</StatusTag>}
                  </div>
                </div>
              ))}
              {!r && !routine.isPending && <p className="p-4 text-subhead text-text-2">No versions yet.</p>}
            </Card>
            <p className="mt-2 text-footnote text-text-2">Saving an edit makes a new version. Sessions you've done keep the version they used.</p>
          </div>

          <div>
            <SectionLabel>Goals · this period</SectionLabel>
            {goals.isPending ? <Skeleton /> : goals.isError ? (
              <Card><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load your goals" action={{ label: "Try again", onClick: () => void goals.refetch() }} /></Card>
            ) : !goals.data.length ? (
              <Card><ScreenState kind="empty" title="No goals yet" body="Goals you add in onboarding show here." /></Card>
            ) : (
              <div className="flex flex-col gap-3">
                {goals.data.map((g) => {
                  const pend = pendingLevel(g.id);
                  const level = (pend ? (pend.payload as { level: GoalLevel }).level : g.level) as GoalLevel | null;
                  return (
                    <Card key={g.id}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-headline font-bold">{g.user_words || g.title}</h3>
                        {pend ? <SaveState state={pend.status === "local" ? "local" : "failed"} onRetry={outbox.retryNow} /> : null}
                      </div>
                      <div role="radiogroup" aria-label="Level this period" className="mt-3 flex flex-wrap gap-2">
                        {GOAL_LEVELS.map((l) => (
                          <Chip key={l} small role="radio" aria-checked={level === l} selected={level === l} onClick={() => void setLevel(g, l)}>{LEVEL_LABEL[l]}</Chip>
                        ))}
                      </div>
                      {!level && <p className="mt-2 text-footnote text-text-2">Level not yet set.</p>}
                      {g.is_demo && <DemoLabel className="mt-3" />}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
