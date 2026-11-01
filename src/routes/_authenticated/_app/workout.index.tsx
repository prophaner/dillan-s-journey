import { createFileRoute } from "@tanstack/react-router";
import { ChoosePage } from "@/v1/ui/choose-page";

// S07 Choose a workout (Workout Now)
export const Route = createFileRoute("/_authenticated/_app/workout/")({
  // ?demo=1 (dev only, S14 "Start demo workout"): the chosen workout starts as a demo session.
  validateSearch: (s: Record<string, unknown>): { demo?: boolean } =>
    s["demo"] === true || s["demo"] === "1" || s["demo"] === 1 ? { demo: true } : {},
  head: () => ({ meta: [{ title: "Choose a workout · Dillan" }] }),
  component: ChoosePage,
});
