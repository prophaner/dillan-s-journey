import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getApi } from "@/v1/data/client";
import { clearDraft } from "@/v1/ui/editor-model";
import { ToastProvider } from "@/components/dillan/overlays";
import { MockBadge } from "@/components/dillan/mock-badge";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-margin">
      <div className="max-w-md text-center">
        <p className="font-voice text-voice-xl">I can't find that page.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center rounded-btn bg-surface-2 px-5 font-bold"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-margin">
      <div className="max-w-md text-center">
        <h1 className="text-title2 font-bold">This page didn't load</h1>
        <p className="mt-2 text-subhead text-text-2">
          Anything you logged is still saved on this device.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex h-11 items-center rounded-btn bg-surface-2 px-5 font-bold"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// Night Gym follows the system setting (prefers-color-scheme).
const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var s=function(){document.documentElement.dataset.theme=m.matches?'dark':'light'};s();m.addEventListener('change',s)}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#F6F3EC" },
      { title: "Dillan — your workouts, on the big screen" },
      {
        name: "description",
        content:
          "Your home-gym workouts, your heart rate on the big screen, your history in one place.",
      },
      { property: "og:title", content: "Dillan — your workouts, on the big screen" },
      {
        property: "og:description",
        content:
          "Your home-gym workouts, your heart rate on the big screen, your history in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        href: "/fonts/Satoshi-Variable.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    // Signing in or out re-runs route guards; signing out also drops every cached query
    // so the next user never sees the previous user's data.
    let off: (() => void) | undefined;
    let live = true;
    void getApi().then(async (api) => {
      let last = (await api.auth.getUser().catch(() => null))?.id ?? null;
      if (!live) return;
      off = api.auth.onChange((user) => {
        const id = user?.id ?? null;
        if (id === last) return; // token refreshes etc.
        // However the session ended (Log out, revoked elsewhere, expired), drop the previous
        // user's private caches: the query cache and their unsaved workout draft.
        if (last && last !== id) clearDraft(last);
        last = id;
        if (!id) queryClient.clear();
        void router.invalidate();
      });
    });
    return () => {
      live = false;
      off?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
        <MockBadge />
      </ToastProvider>
    </QueryClientProvider>
  );
}
