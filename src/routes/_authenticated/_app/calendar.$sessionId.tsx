import { createFileRoute } from "@tanstack/react-router";
import { SessionDetailPage } from "@/v1/ui/session-detail-page";

// S13 Session detail
export const Route = createFileRoute("/_authenticated/_app/calendar/$sessionId")({
  head: () => ({ meta: [{ title: "Session · Dillan" }] }),
  component: DetailRoute,
});

function DetailRoute() {
  const { sessionId } = Route.useParams();
  return <SessionDetailPage key={sessionId} sessionId={sessionId} />;
}
