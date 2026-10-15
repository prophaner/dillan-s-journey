import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { PlaceholderPage } from "@/components/dillan/placeholder-page";

export const Route = createFileRoute("/_authenticated/_app/settings")({
  head: () => pageHead("Settings", "Notifications, privacy, export and accessibility."),
  component: () => <PlaceholderPage title="Settings" body="Notifications, privacy, AI data permissions, export and deletion." />,
});
