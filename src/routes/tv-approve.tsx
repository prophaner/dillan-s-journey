import { createFileRoute, redirect } from "@tanstack/react-router";

// QR deep link from the TV pairing screen: /tv-approve?code=DLN-XXXX. Signed-out phones log in
// first and come back with the code kept (handoff acceptance 5). The code alone grants nothing.
export const Route = createFileRoute("/tv-approve")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s["code"] === "string" ? s["code"] : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/approve-tv", search: { code: search.code }, replace: true });
  },
});
