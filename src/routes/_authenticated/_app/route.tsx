import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getApi } from "@/v1/data/client";
import { qk } from "@/v1/data/queries";
import { AppShell } from "@/components/dillan/app-shell";

export const Route = createFileRoute("/_authenticated/_app")({
  beforeLoad: async ({ context, location }) => {
    const api = await getApi();
    // New accounts finish the name step first (S02 profile step). A failed read never blocks.
    const profile = await context.queryClient
      .ensureQueryData({ queryKey: qk.profile(context.user.id), queryFn: () => api.profile.get() })
      .catch(() => null);
    if (profile?.needs_name) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
