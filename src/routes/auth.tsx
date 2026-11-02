import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getApi, useApi } from "@/v1/data/client";
import {
  clearLinkRequest,
  confirmPendingLink,
  dropPendingLink,
  pendingLink,
  readLinkRequest,
  takeLinkOutcome,
} from "@/v1/data/auth-callback";
import { qk } from "@/v1/data/queries";
import { AuthFlow, LinkPending } from "@/v1/ui/auth-flow";
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
        content: "Register or log in to Dillan with an email link or a 6-digit code. No password.",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    // getApi() finishes an email sign-in link that landed here (src/v1/data/auth-callback.ts).
    const api = await getApi();
    // The link carries ?redirect= itself; a link from an older email may not: fall back to what
    // this browser asked for. Read on every run (router.invalidate re-runs this) and cleared only
    // once sign-in actually continues, so "Try again" keeps the target.
    const target = search.redirect ?? readLinkRequest()?.returnTo ?? undefined;
    // A link waiting on the person (unexpected link to confirm, or a retry after a network error).
    const pending = pendingLink();
    if (pending)
      return {
        target,
        pending,
        linkError: null,
        linkEmail: "",
        needsName: false,
        profileFailed: false,
      };
    const link = takeLinkOutcome();
    const base = {
      target,
      pending: null,
      linkError: link?.kind === "error" ? link.error : null,
      // Only the link's own email, never the remembered request (that would reveal the last
      // email asked for on a shared browser to anyone opening /auth#error_code=x).
      linkEmail: link?.kind === "error" ? (link.email ?? "") : "",
    };
    const user = await api.auth.getUser().catch(() => null);
    if (!user) return { ...base, needsName: false, profileFailed: false };
    const profile = await api.profile.get().catch(() => null);
    // A failed read is not "needs a name": showing the name step to an existing user would let
    // Finish overwrite their timezone and units with this browser's defaults.
    if (!profile) return { ...base, needsName: false, profileFailed: true };
    if (!profile.needs_name) {
      clearLinkRequest();
      throw redirect({ href: safeRedirect(target) });
    }
    return { ...base, needsName: true, profileFailed: false };
  },
  component: AuthRoute,
});

function AuthRoute() {
  const { target, pending, needsName, profileFailed, linkError, linkEmail } =
    Route.useRouteContext();
  const api = useApi();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  if (pending)
    return (
      <LinkPending
        pending={pending}
        onContinue={async () => {
          await confirmPendingLink(api);
          await router.invalidate();
        }}
        onCancel={() => {
          dropPendingLink();
          void router.invalidate();
        }}
      />
    );
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
      returnTo={target ? safeRedirect(target) : undefined}
      linkError={needsName ? null : linkError}
      initialEmail={linkEmail}
      onDone={() => {
        clearLinkRequest();
        void qc.invalidateQueries({ queryKey: ["v1"] });
        void navigate({ href: safeRedirect(target), replace: true });
      }}
      onProfileSaved={(p) => qc.setQueryData(qk.profile(p.id), p)}
    />
  );
}
