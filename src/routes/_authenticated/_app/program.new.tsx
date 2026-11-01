import { createFileRoute } from "@tanstack/react-router";
import { EditorPage } from "@/v1/ui/editor-page";

// S06 new workout
export const Route = createFileRoute("/_authenticated/_app/program/new")({
  head: () => ({ meta: [{ title: "New workout · Dillan" }] }),
  component: () => <EditorPage templateId={null} />,
});
