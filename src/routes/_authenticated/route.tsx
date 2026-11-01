import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getApi } from "@/v1/data/client";
import { UserProvider } from "@/v1/ui/user-context";
import { AppStart } from "@/v1/ui/app-start";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const api = await getApi();
    const user = await api.auth.getUser();
    // A paired TV's session is device-scoped: the phone app (notes, account actions, no
    // auto-lock) never runs on it. This browser is a TV; send it back to the TV surface.
    if (user && api.tv.isTvSession(user.id)) throw redirect({ to: "/tv" });
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
