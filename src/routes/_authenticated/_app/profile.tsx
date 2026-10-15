import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { PlaceholderPage } from "@/components/dillan/placeholder-page";

export const Route = createFileRoute("/_authenticated/_app/profile")({
  head: () => pageHead("Profile", "Equipment, limitations, availability and units."),
  component: () => <PlaceholderPage title="Profile" body="Equipment, limitations, availability and units (pounds and inches by default)." />,
});
