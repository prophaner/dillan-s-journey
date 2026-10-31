import { createFileRoute } from "@tanstack/react-router";
import { getApi } from "@/v1/data/client";
import { RelayPage } from "@/v1/relay/relay-page";

// S16 Relay (h10-design 6): the heart-rate relay page, the only page that uses Bluetooth. Not
// behind the signed-in layout: when the relay's sign-in expires it keeps the strap connected and
// shows "Signed out. Sign in to keep relaying." instead of navigating away. ?demo=1 adds the
// "Simulate strap (DEMO)" source (S14 dev toggle).
export const Route = createFileRoute("/relay")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { demo?: boolean } =>
    s["demo"] === true || s["demo"] === "1" || s["demo"] === 1 ? { demo: true } : {},
  head: () => ({
    meta: [{ title: "Dillan relay" }, { name: "theme-color", content: "#121210" }],
  }),
  loader: () => getApi(),
  component: RelayRoute,
});

function RelayRoute() {
  const api = Route.useLoaderData();
  const { demo } = Route.useSearch();
  // The simulated strap is a development tool (h10-design 6 S14 "Dev only").
  return <RelayPage api={api} demo={import.meta.env.DEV && !!demo} />;
}
