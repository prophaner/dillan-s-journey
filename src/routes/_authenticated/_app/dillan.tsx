import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { PlaceholderPage } from "@/components/dillan/placeholder-page";

export const Route = createFileRoute("/_authenticated/_app/dillan")({
  head: () => pageHead("Dillan", "Talk with Dillan and review his proposals."),
  component: () => <PlaceholderPage title="Dillan" body="Conversation and proposals arrive in Phase 2. Nothing Dillan suggests will ever apply itself." />,
});
