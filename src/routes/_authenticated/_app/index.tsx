import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/v1/ui/home-page";

// S04 Home
export const Route = createFileRoute("/_authenticated/_app/")({
  head: () => ({ meta: [{ title: "Home · Dillan" }] }),
  component: HomePage,
});
