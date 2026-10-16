import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { PlaceholderPage } from "@/components/dillan/placeholder-page";

export const Route = createFileRoute("/_authenticated/_app/plan")({
  head: () => pageHead("Plan", "Your program, routines and exercise library."),
  component: () => <PlaceholderPage title="Plan" body="Your routines and exercise library will live here." />,
});
