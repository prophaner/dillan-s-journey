import { createFileRoute } from "@tanstack/react-router";
import { PreflightPage } from "@/v1/ui/preflight-page";

// S08 Preflight: nothing starts until the user presses Start
export const Route = createFileRoute("/_authenticated/_app/workout/$templateId")({
  validateSearch: (s: Record<string, unknown>): { demo?: boolean } =>
    s["demo"] === true || s["demo"] === "1" || s["demo"] === 1 ? { demo: true } : {},
  head: () => ({ meta: [{ title: "Ready? · Dillan" }] }),
  component: PreflightRoute,
});

function PreflightRoute() {
  const { templateId } = Route.useParams();
  const { demo } = Route.useSearch();
  // Demo workouts are a development tool only (h10-design 6 S14).
  return (
    <PreflightPage key={templateId} templateId={templateId} demo={import.meta.env.DEV && !!demo} />
  );
}
