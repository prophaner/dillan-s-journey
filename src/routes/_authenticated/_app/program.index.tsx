import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useProfile, useTemplates } from "@/v1/data/queries";
import { templateSummary } from "@/v1/ui/editor-model";
import { useUser } from "@/v1/ui/user-context";
import { AvatarLink, ScreenHeader } from "@/components/dillan/app-shell";
import { dButton } from "@/components/dillan/button";
import { ScreenState } from "@/components/dillan/surfaces";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";

// S05 Program library (phone/desktop): the user's saved workouts, newest edit first.
export const Route = createFileRoute("/_authenticated/_app/program/")({
  head: () => ({ meta: [{ title: "Program · Dillan" }] }),
  component: ProgramPage,
});

function ProgramPage() {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  const { data: templates, isLoading, isError, refetch } = useTemplates(user.id);

  return (
    <>
      <ScreenHeader
        big
        title="Program"
        trailing={<AvatarLink name={profile?.display_name ?? ""} />}
      />
      {isLoading ? (
        <ScreenState kind="loading" />
      ) : isError ? (
        <ScreenState
          kind="failed"
          title="Couldn't load your workouts"
          body="Check your connection."
          action={{ label: "Try again", onClick: () => void refetch() }}
        />
      ) : !templates?.length ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <SpotMark size={44} className="text-text" />
          <h2 className="mt-4 text-title3 font-bold">No workouts yet</h2>
          <p className="mt-2 max-w-sm text-subhead text-text-2">
            A workout is a named list of exercises you can repeat. Build one once, then pick it from
            the TV whenever you train.
          </p>
          <Link
            to="/program/new"
            className={cn(dButton({ variant: "primary", size: "md" }), "mt-6 h-[52px]")}
          >
            Create your first workout
          </Link>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <Link
            to="/program/new"
            className={cn(dButton({ variant: "outline", size: "lg" }), "h-14")}
          >
            <Plus className="size-5" aria-hidden />
            New workout
          </Link>
          <ul className="flex flex-col gap-3">
            {templates.map((t) => {
              const s = templateSummary(t);
              return (
                <li key={t.id}>
                  <Link
                    to="/program/$id"
                    params={{ id: t.id }}
                    className="press flex items-center gap-3 rounded-card border border-line bg-surface p-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-headline font-bold">{t.name}</span>
                      <span className="mt-0.5 block text-subhead text-text-2">{s.meta}</span>
                      <span className="mt-0.5 block break-words text-subhead text-text-2">
                        {s.names}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-footnote text-text-2">
            Editing or deleting a workout never changes sessions you've already logged.
          </p>
        </div>
      )}
    </>
  );
}
