import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronLeft, User } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import { exerciseBadge } from "@/lib/plan";
import { Card, ScreenState, SectionLabel } from "@/components/dillan/surfaces";
import { DemoLabel, StatusTag, UnknownValue } from "@/components/dillan/tags";

export const Route = createFileRoute("/_authenticated/_app/plan/exercise/$id")({
  head: () => pageHead("Exercise", "What this exercise is for, how to do it, and alternatives."),
  component: ExerciseDetail,
});

function ExerciseDetail() {
  const { user } = Route.useRouteContext();
  const { id } = Route.useParams();
  const ex = useQuery({
    queryKey: ["exercise", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, owner_id, name, movement, muscles, cues, equipment, review_status, is_demo").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const back = <Link to="/plan" className="mt-6 inline-flex min-h-11 items-center gap-1 text-subhead font-medium text-text-2"><ChevronLeft className="size-4" aria-hidden />Plan</Link>;
  if (ex.isPending) return <>{back}<div className="mt-4 h-64 animate-pulse rounded-card bg-surface-2" aria-busy="true" aria-label="Loading" /></>;
  if (ex.isError) return <>{back}<Card className="mt-4"><ScreenState kind={navigator.onLine ? "failed" : "offline"} title="Couldn't load this exercise" action={{ label: "Try again", onClick: () => void ex.refetch() }} /></Card></>;
  if (!ex.data) return <>{back}<Card className="mt-4"><ScreenState kind="empty" title="Exercise not found" /></Card></>;
  const e = ex.data;
  const badge = exerciseBadge(e, user.id);
  const list = (xs: string[] | null) => (xs?.length ? xs : null);
  return (
    <div className="pb-10 lg:max-w-[720px]">
      {back}
      <h1 className="mt-1 text-title1 font-bold leading-tight">{e.name}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <StatusTag kind={badge === "Reviewed" ? "done" : "neutral"} icon={badge === "Yours" ? <User className="size-3.5" aria-hidden /> : badge === "Reviewed" ? <BadgeCheck className="size-3.5" aria-hidden /> : undefined}>{badge}</StatusTag>
        {e.is_demo && <DemoLabel />}
      </div>

      <SectionLabel>Intended emphasis</SectionLabel>
      <Card>
        {list(e.muscles) || e.movement ? (
          <p className="text-body">{[e.movement, list(e.muscles)?.join(", ")].filter(Boolean).join(" · ")}</p>
        ) : <UnknownValue />}
        <p className="mt-2 text-footnote text-text-2">What the exercise aims at. How it feels doesn't prove which muscles worked.</p>
      </Card>

      <SectionLabel>Cues</SectionLabel>
      <Card>{list(e.cues) ? <ul className="list-disc pl-5 text-body">{e.cues.map((c) => <li key={c}>{c}</li>)}</ul> : <UnknownValue />}</Card>

      <SectionLabel>Equipment</SectionLabel>
      <Card>{list(e.equipment) ? <p className="text-body">{e.equipment.join(", ")}</p> : <UnknownValue />}</Card>

      <SectionLabel>Alternatives</SectionLabel>
      <Card><p className="flex flex-wrap items-center gap-2 text-subhead text-text-2"><UnknownValue />No reviewed alternatives are stored yet.</p></Card>
    </div>
  );
}
