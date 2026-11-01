import { createFileRoute } from "@tanstack/react-router";
import { getApi } from "@/v1/data/client";
import { TvApp } from "@/v1/tv/tv-app";

// The TV surface (build-plan D11): same bundle, dark 1920×1080 canvas, D-pad only. Not behind the
// signed-in layout: the TV signs in by pairing (S03), never with a keyboard. Screens are app state,
// not URLs (Back is app-defined per screen; see src/v1/tv/screens.ts).
export const Route = createFileRoute("/tv")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Dillan on TV" }, { name: "theme-color", content: "#121210" }],
  }),
  loader: () => getApi(),
  component: TvRoute,
});

function TvRoute() {
  const api = Route.useLoaderData();
  return <TvApp api={api} />;
}
