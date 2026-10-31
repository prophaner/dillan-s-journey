import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getApi } from "@/v1/data/client";
import { UserProvider } from "@/v1/ui/user-context";
import { AppStart } from "@/v1/ui/app-start";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const api = await getApi();
    const user = await api.auth.getUser();
    if (user) return { user };
    // Signed out: log in first, then come back here (handoff acceptance 5: the TV code is kept).
    throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <UserProvider user={user}>
      <AppStart key={user.id} userId={user.id} />
      <Outlet />
    </UserProvider>
  );
}
