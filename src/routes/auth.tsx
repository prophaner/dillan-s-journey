import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/v1/data/client";
import { qk } from "@/v1/data/queries";
import { AuthFlow } from "@/v1/ui/auth-flow";
import { safeRedirect } from "@/v1/ui/redirect";

type AuthSearch = { redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Register or log in · Dillan" },
      {
        name: "description",
        content: "Register or log in to Dillan with a 6-digit code. No password.",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const api = await getApi();
    const user = await api.auth.getUser().catch(() => null);
    if (!user) return { needsName: false };
    const profile = await api.profile.get().catch(() => null);
    if (profile && !profile.needs_name) throw redirect({ href: safeRedirect(search.redirect) });
    return { needsName: true };
  },
  component: AuthRoute,
});

function AuthRoute() {
  const { redirect: target } = Route.useSearch();
  const { needsName } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <AuthFlow
      initialStep={needsName ? "name" : "welcome"}
      forTv={safeRedirect(target).startsWith("/approve-tv")}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: ["v1"] });
        void navigate({ href: safeRedirect(target), replace: true });
      }}
      onProfileSaved={(p) => qc.setQueryData(qk.profile(p.id), p)}
    />
  );
}
