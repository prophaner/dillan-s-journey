import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { onboardedFlag } from "@/lib/onboarding";
import { AppShell } from "@/components/dillan/app-shell";

export const Route = createFileRoute("/_authenticated/_app")({
  beforeLoad: async ({ context }) => {
    const flag = onboardedFlag(context.user.id);
    if (localStorage.getItem(flag)) return;
    // Offline or a failed read never blocks the app; it just skips the check.
    const { data, error } = await supabase
      .from("profiles").select("onboarding_status").eq("id", context.user.id).maybeSingle();
    if (error || !data) return;
    if (data.onboarding_status === "done") localStorage.setItem(flag, "1");
    else throw redirect({ to: "/onboarding" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
