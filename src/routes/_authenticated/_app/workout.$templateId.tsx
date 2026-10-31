import { createFileRoute } from "@tanstack/react-router";
import { PreflightPage } from "@/v1/ui/preflight-page";

// S08 Preflight: nothing starts until the user presses Start
export const Route = createFileRoute("/_authenticated/_app/workout/$templateId")({
  head: () => ({ meta: [{ title: "Ready? · Dillan" }] }),
  component: PreflightRoute,
});

function PreflightRoute() {
  const { templateId } = Route.useParams();
  return <PreflightPage key={templateId} templateId={templateId} />;
}
