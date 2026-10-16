import { useEffect, useState, type ReactNode } from "react";
import { checkStorage } from "@/lib/device";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Sun, Dumbbell, TrendingUp, ClipboardList, User, Settings, LogOut, FlaskConical, Component, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearAccount, unsyncedCount } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { useRegisterServiceWorker } from "@/lib/sw";
import { clearDrafts } from "@/lib/workout-store";
import { SpotMark } from "./spot-mark";
import { SaveState } from "./tags";
import { Sheet } from "./overlays";
import { ConflictCards, YourDataSheet } from "./sync-pieces";
import { DButton } from "./button";

const tabs = [
  { to: "/today", label: "Today", icon: <Sun className="size-6" aria-hidden /> },
  { to: "/train", label: "Train", icon: <Dumbbell className="size-6" aria-hidden /> },
  { to: "/progress", label: "Progress", icon: <TrendingUp className="size-6" aria-hidden /> },
  { to: "/dillan", label: "Dillan", icon: <SpotMark size={26} className="text-current" /> },
] as const;

const more = [
  { to: "/plan", label: "Plan", icon: <ClipboardList className="size-5" aria-hidden /> },
  { to: "/profile", label: "Profile", icon: <User className="size-5" aria-hidden /> },
  { to: "/settings", label: "Settings", icon: <Settings className="size-5" aria-hidden /> },
] as const;

const dev = [
  { to: "/dev/components", label: "Components", icon: <Component className="size-5" aria-hidden /> },
  { to: "/dev/spikes", label: "Phase 0 tests", icon: <FlaskConical className="size-5" aria-hidden /> },
] as const;

function initials(email: string) {
  return (email.split("@")[0] ?? "").slice(0, 2).toUpperCase() || "—";
}

export function Avatar({ email, onClick }: { email: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Open menu" className="press grid size-11 place-items-center rounded-full bg-surface-2 text-subhead font-bold">
      {initials(email)}
    </button>
  );
}

export function useSignOut(accountId: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    const n = await unsyncedCount(accountId);
    if (n > 0 && !window.confirm(`${n} item${n === 1 ? "" : "s"} saved on this device haven't synced yet. Sign out anyway? They'll be removed from this device.`)) return;
    await qc.cancelQueries();
    qc.clear();
    await clearAccount(accountId);
    await clearDrafts(accountId);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

export function AppShell({ user, children }: { user: { id: string; email: string }; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const { state, pending, failed, retryNow, syncNow, loaded, items } = useOutbox(user.id);
  useRegisterServiceWorker();
  // Storage probe at app start (AT-34); Today reads the same cached result.
  useEffect(() => { void checkStorage(); }, []);
  const navigate = useNavigate();
  const signOut = useSignOut(user.id);

  const navLink = "flex items-center gap-3 rounded-btn px-4 h-12 text-headline font-medium text-text-2 hover:bg-surface-2";
  const navActive = "bg-surface-2 text-text font-bold";

  return (
    <div className="min-h-dvh lg:pl-sidebar">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
        <Link to="/today" className="mb-8 flex items-center gap-2 px-2 text-title3 font-bold">
          <SpotMark size={30} className="text-text" /> Dillan
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to} className={navLink} activeProps={{ className: navActive }}>
              <span className="[&_svg]:size-5">{t.icon}</span>
              {t.label}
            </Link>
          ))}
          <p className="mb-2 mt-6 px-4 text-footnote font-bold uppercase tracking-wider text-text-3">More</p>
          {more.map((t) => (
            <Link key={t.to} to={t.to} className={navLink} activeProps={{ className: navActive }}>
              {t.icon}
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between px-2">
          {loaded && <SaveState state={state} count={pending + failed} onRetry={retryNow} />}
          <Avatar email={user.email} onClick={() => setMenu(true)} />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[640px] px-margin pb-nav lg:max-w-[1120px] lg:px-12 lg:pb-12">
        {loaded && <ConflictCards items={items} onResolved={() => void syncNow()} onDraft={() => void navigate({ to: "/plan/edit" })} />}
        {children}
      </main>

      {/* Phone/tablet bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-safe-b lg:hidden">
        <ul className="mx-auto grid h-nav max-w-[640px] grid-cols-4">
          {tabs.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                className="flex h-full flex-col items-center justify-center gap-0.5 text-footnote font-medium text-text-3"
                activeProps={{ className: "text-text font-bold [&_.nav-dot]:opacity-100", "aria-current": "page" }}
              >
                {t.icon}
                {t.label}
                <span className="nav-dot size-1.5 rounded-full bg-spot opacity-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <p className="mb-4 text-subhead text-text-2">{user.email}</p>
        <nav className="flex flex-col gap-1" aria-label="More">
          {[...more, ...dev].map((t) => (
            <Link key={t.to} to={t.to} onClick={() => setMenu(false)} className={navLink}>
              {t.icon}
              {t.label}
            </Link>
          ))}
          <button type="button" className={navLink} onClick={() => { setMenu(false); setDataOpen(true); }}>
            <HardDrive className="size-5" aria-hidden />
            Your data
          </button>
        </nav>
        <div className="mt-4 border-t border-line pt-4">
          {loaded && <SaveState state={state} count={pending + failed} onRetry={retryNow} />}
          <DButton variant="secondary" size="md" className="mt-4 w-full" icon={<LogOut className="size-4" aria-hidden />} onClick={signOut}>
            Sign out
          </DButton>
        </div>
      </Sheet>
      <YourDataSheet open={dataOpen} onClose={() => setDataOpen(false)} email={user.email} items={items} onSync={retryNow} />
    </div>
  );
}
