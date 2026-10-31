import { createFileRoute } from "@tanstack/react-router";
import { SessionPage } from "@/v1/ui/session-page";

// S09 Dashboard / S10 Paused / S11 Summary. A session is a mode, not a tab: no nav shell.
export const Route = createFileRoute("/_authenticated/session/$id")({
  head: () => ({ meta: [{ title: "Workout · Dillan" }] }),
  component: SessionRoute,
});

function SessionRoute() {
  const { id } = Route.useParams();
  return <SessionPage key={id} sessionId={id} />;
}
