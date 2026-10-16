import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: { id: data.user.id, email: data.user.email ?? "" } };
    // Offline, the server check can't run: trust the session on this device (AT-36).
    if (error && !navigator.onLine) {
      const { data: s } = await supabase.auth.getSession();
      const u = s.session?.user;
      if (u) return { user: { id: u.id, email: u.email ?? "" } };
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
