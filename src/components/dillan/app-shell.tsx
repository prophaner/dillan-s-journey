// V1 signed-in shell (handoff 2, IA "Navigation model"): bottom nav Home · Program · Calendar on
// phone (<1024 px), 240 px side nav with Profile at the bottom from 1024 px, avatar → Profile.

import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, Home, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

const tabs = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/program", label: "Program", icon: ListChecks, exact: false },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, exact: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const side =
    "flex h-12 items-center gap-3 rounded-btn px-4 text-headline font-medium text-text-2 hover:bg-surface-2";
  const sideOn = "bg-surface-2 font-bold text-text";
  return (
    <div className="min-h-dvh lg:pl-sidebar">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link to="/" className="mb-8 px-2" aria-label="Dillan home">
          <Wordmark height={30} />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: t.exact }}
              className={side}
              activeProps={{ className: sideOn, "aria-current": "page" }}
            >
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </Link>
          ))}
        </nav>
        <Link
          to="/profile"
          className={cn(side, "mt-auto")}
          activeProps={{ className: sideOn, "aria-current": "page" }}
        >
          <User className="size-5" aria-hidden />
          Profile
        </Link>
      </aside>

      <main className="mx-auto w-full max-w-[600px] px-margin pb-nav lg:max-w-[720px] lg:px-8 lg:pb-12">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe-b lg:hidden"
      >
        <ul className="mx-auto grid h-nav max-w-[600px] grid-cols-3">
          {tabs.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                activeOptions={{ exact: t.exact }}
                className="flex h-full flex-col items-center justify-center gap-0.5 text-footnote font-medium text-text-2"
                activeProps={{ className: "!font-bold !text-text", "aria-current": "page" }}
              >
                <t.icon className="size-6" aria-hidden />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Initial on an oak circle; 44 px target. */
export function AvatarLink({ name }: { name: string }) {
  return (
    <Link
      to="/profile"
      aria-label="Profile and settings"
      className="press grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-headline font-bold text-text"
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </Link>
  );
}

/**
 * Screen title row. `back` renders a real Back button (also what browser Back does);
 * `avatar` shows the Profile avatar on tab screens.
 */
export function ScreenHeader({
  title,
  back,
  onBack,
  trailing,
  big,
}: {
  title: string;
  back?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  big?: boolean;
}) {
  const router = useRouter();
  const goBack = onBack ?? (back ? () => void router.navigate({ to: back }) : undefined);
  return (
    <header className="flex min-h-[72px] items-center gap-2 pt-4 lg:pt-8">
      {goBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      )}
      <h1
        className={cn(
          "min-w-0 flex-1 font-bold leading-tight",
          big ? "text-title1 lg:text-[2.25rem]" : "text-title2",
        )}
      >
        {title}
      </h1>
      {trailing}
    </header>
  );
}
