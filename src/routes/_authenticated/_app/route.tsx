import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/dillan/app-shell";

export const Route = createFileRoute("/_authenticated/_app")({
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
