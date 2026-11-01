import { createFileRoute } from "@tanstack/react-router";
import { EditorPage } from "@/v1/ui/editor-page";

// S06 edit workout
export const Route = createFileRoute("/_authenticated/_app/program/$id")({
  head: () => ({ meta: [{ title: "Edit workout · Dillan" }] }),
  component: EditRoute,
});

function EditRoute() {
  const { id } = Route.useParams();
  return <EditorPage templateId={id} />;
}
