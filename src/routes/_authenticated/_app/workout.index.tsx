import { createFileRoute } from "@tanstack/react-router";
import { ChoosePage } from "@/v1/ui/choose-page";

// S07 Choose a workout (Workout Now)
export const Route = createFileRoute("/_authenticated/_app/workout/")({
  head: () => ({ meta: [{ title: "Choose a workout · Dillan" }] }),
  component: ChoosePage,
});
