import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/v1/data/client";
import { qk } from "@/v1/data/queries";
import { AuthFlow } from "@/v1/ui/auth-flow";
import { safeRedirect } from "@/v1/ui/redirect";
import { ScreenState } from "@/components/dillan/surfaces";

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
    if (!user) return { needsName: false, profileFailed: false };
    const profile = await api.profile.get().catch(() => null);
    // A failed read is not "needs a name": showing the name step to an existing user would let
    // Finish overwrite their timezone and units with this browser's defaults.
    if (!profile) return { needsName: false, profileFailed: true };
    if (!profile.needs_name) throw redirect({ href: safeRedirect(search.redirect) });
    return { needsName: true, profileFailed: false };
  },
  component: AuthRoute,
});

function AuthRoute() {
  const { redirect: target } = Route.useSearch();
  const { needsName, profileFailed } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  if (profileFailed)
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-margin">
        <ScreenState
          kind="failed"
          title="Couldn't load your profile"
          body="Check your connection, then try again."
          action={{ label: "Try again", onClick: () => void router.invalidate() }}
        />
      </div>
    );
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
