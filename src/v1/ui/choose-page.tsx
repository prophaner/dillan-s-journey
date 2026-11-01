// S07 Choose a workout (phone/desktop). Workout Now always goes through a saved template; with
// none, the empty state points to the editor and nothing is created (acceptance 17).

import { Link, useSearch } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTemplates } from "@/v1/data/queries";
import { templateSummary } from "./editor-model";
import { useUser } from "./user-context";
import { RunningBanner } from "./running-banner";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { dButton } from "@/components/dillan/button";
import { ScreenState } from "@/components/dillan/surfaces";
import { SpotMark } from "@/components/dillan/spot-mark";
import { cn } from "@/lib/utils";

export const CHOOSE_COPY = {
  title: "Choose a workout",
  emptyTitle: "Create your first workout",
  emptyBody:
    "Workout Now needs a saved workout to follow. It takes about two minutes to build one.",
  emptyAction: "Create a workout",
  nothingStarts: "Nothing starts until you press Start on the next screen.",
} as const;

export function ChoosePage() {
  const user = useUser();
  const { data: templates, isLoading, isError, refetch } = useTemplates(user.id);
  // S14 dev "Start demo workout": the choice is carried to preflight (dev builds only).
  const demo = useSearch({ strict: false }) as { demo?: boolean };
  const demoSearch: { demo?: boolean } = import.meta.env.DEV && demo.demo ? { demo: true } : {};

  if (isLoading) return <ScreenState kind="loading" />;
  if (isError)
    return (
      <>
        <ScreenHeader title={CHOOSE_COPY.title} back="/" />
        <ScreenState
          kind="failed"
          title="Couldn't load your workouts"
          body="Check your connection."
          action={{ label: "Try again", onClick: () => void refetch() }}
        />
      </>
    );
  if (!templates?.length)
    return (
      <>
        <ScreenHeader title="Workout Now" back="/" />
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <SpotMark size={44} className="text-text" />
          <h2 className="mt-4 text-title3 font-bold">{CHOOSE_COPY.emptyTitle}</h2>
          <p className="mt-2 max-w-sm text-subhead text-text-2">{CHOOSE_COPY.emptyBody}</p>
          <Link
            to="/program/new"
            className={cn(dButton({ variant: "primary", size: "md" }), "mt-6 h-[52px]")}
          >
            {CHOOSE_COPY.emptyAction}
          </Link>
        </div>
      </>
    );

  return (
    <>
      <ScreenHeader title={CHOOSE_COPY.title} back="/" />
      <RunningBanner className="mb-3" />
      <p className="text-subhead text-text-2">{CHOOSE_COPY.nothingStarts}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {templates.map((t) => {
          const s = templateSummary(t);
          return (
            <li key={t.id}>
              <Link
                to="/workout/$templateId"
                params={{ templateId: t.id }}
                search={demoSearch}
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
    </>
  );
}
