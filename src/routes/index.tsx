import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SpotMark } from "@/components/dillan/spot-mark";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dillan — your home-gym coach" },
      { name: "description", content: "Dillan plans, spots and adapts your home-gym training, even offline." },
      { property: "og:title", content: "Dillan — your home-gym coach" },
      { property: "og:description", content: "Dillan plans, spots and adapts your home-gym training, even offline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/today" : "/auth" });
  },
  component: () => (
    <div className="grid min-h-dvh place-items-center">
      <SpotMark size={48} animate className="text-text" title="Dillan" />
    </div>
  ),
});
