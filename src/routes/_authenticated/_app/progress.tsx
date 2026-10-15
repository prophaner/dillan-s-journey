import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { PlaceholderPage } from "@/components/dillan/placeholder-page";

export const Route = createFileRoute("/_authenticated/_app/progress")({
  head: () => pageHead("Progress", "Your objectives, steady weeks and measurements."),
  component: () => <PlaceholderPage title="Progress" body="Objectives, steady weeks and measurements appear after your first sessions." />,
});
