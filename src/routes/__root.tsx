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
import { supabase } from "@/integrations/supabase/client";
import { ToastProvider } from "@/components/dillan/overlays";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-margin">
      <div className="max-w-md text-center">
        <p className="font-voice text-voice-xl">I can't find that page.</p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-btn bg-surface-2 px-5 font-bold">
          Go to Today
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
        <p className="mt-2 text-subhead text-text-2">Anything you logged is still saved on this device.</p>
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
      { title: "Dillan — your home-gym coach" },
      { name: "description", content: "Dillan plans, spots and adapts your home-gym training." },
      { property: "og:title", content: "Dillan — your home-gym coach" },
      { property: "og:description", content: "Dillan plans, spots and adapts your home-gym training." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preload", href: "/fonts/Satoshi-Variable.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
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
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </QueryClientProvider>
  );
}
