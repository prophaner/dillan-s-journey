import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SpotMark } from "@/components/dillan/spot-mark";
import { DButton } from "@/components/dillan/button";
import { Banner } from "@/components/dillan/surfaces";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · Dillan" },
      { name: "description", content: "Sign in to Dillan with a link sent to your email." },
      { property: "og:title", content: "Sign in · Dillan" },
      { property: "og:description", content: "Sign in to Dillan with a link sent to your email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/today" });
  },
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-margin py-10">
      <SpotMark size={56} className="text-text" />
      <h1 className="mt-6 font-voice text-voice-xl leading-[1.2]">I'm Dillan. Let's get you in.</h1>
      <p className="mt-2 text-body text-text-2">Enter your email and I'll send you a sign-in link. No password.</p>

      {state === "sent" ? (
        <Banner className="mt-8" icon={<Mail className="size-5 shrink-0" aria-hidden />}>
          Check <strong>{email}</strong> and tap the link. You can close this tab.
        </Banner>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-subhead font-bold">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 rounded-btn border border-line bg-surface px-4 text-callout"
            />
          </label>
          {state === "error" && <Banner>That didn't send: {error}</Banner>}
          <DButton type="submit" variant="primary" loading={state === "sending"}>
            Send sign-in link
          </DButton>
        </form>
      )}
    </div>
  );
}
