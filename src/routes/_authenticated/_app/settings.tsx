import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Accessibility, Bell, BrainCircuit, Download, HardDrive, LogOut, Shield, Trash2 } from "lucide-react";
import { pageHead } from "@/lib/head";
import { useOutbox } from "@/lib/use-outbox";
import { Card, OptionRow, PageHeader, SectionLabel } from "@/components/dillan/surfaces";
import { StatusTag } from "@/components/dillan/tags";
import { DButton } from "@/components/dillan/button";
import { YourDataSheet } from "@/components/dillan/sync-pieces";
import { UnitsControl } from "@/components/dillan/profile-pieces";
import { useSignOut } from "@/components/dillan/app-shell";

export const Route = createFileRoute("/_authenticated/_app/settings")({
  head: () => pageHead("Settings", "Your data on this phone, units, sign out, and what's coming for privacy and export."),
  component: Settings,
});

const LATER = [
  { icon: <Bell className="size-5" aria-hidden />, title: "Notifications", line: "No reminders are sent yet. You'll choose them here." },
  { icon: <Shield className="size-5" aria-hidden />, title: "Privacy", line: "Your data is stored on your account and shared with no one unless you invite a coach." },
  { icon: <BrainCircuit className="size-5" aria-hidden />, title: "AI data permissions", line: "Dillan's AI isn't on yet, so nothing is sent to it." },
  { icon: <Download className="size-5" aria-hidden />, title: "Export", line: "Downloading a copy of everything isn't built yet." },
  { icon: <Trash2 className="size-5" aria-hidden />, title: "Deletion", line: "Deleting your account from here isn't built yet. Until then, ask and it will be done by hand." },
  { icon: <Accessibility className="size-5" aria-hidden />, title: "Accessibility", line: "Dillan follows your phone's text size, motion and dark mode settings for now." },
];

function Settings() {
  const { user } = Route.useRouteContext();
  const outbox = useOutbox(user.id);
  const signOut = useSignOut(user.id);
  const [dataOpen, setDataOpen] = useState(false);
  const unsynced = outbox.items.filter((i) => i.status !== "synced").length;
  return (
    <div className="pb-10">
      <PageHeader title="Settings" />
      <SectionLabel>On this phone</SectionLabel>
      <OptionRow icon={<HardDrive className="size-5" aria-hidden />} title="Your data on this phone"
        detail={outbox.loaded ? (unsynced ? `${unsynced} not synced yet` : "Everything is synced") : undefined} onClick={() => setDataOpen(true)} />

      <SectionLabel>Units</SectionLabel>
      <UnitsControl uid={user.id} />

      <SectionLabel>Coming later</SectionLabel>
      <ul className="flex flex-col gap-3">
        {LATER.map((x) => (
          <li key={x.title}>
            <Card className="flex items-start gap-3">
              <span className="mt-0.5 text-text-2">{x.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-headline font-bold">{x.title}<StatusTag kind="neutral">Coming later</StatusTag></p>
                <p className="mt-1 text-subhead text-text-2">{x.line}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <SectionLabel>Account</SectionLabel>
      <Card>
        <p className="text-subhead text-text-2">Signed in as {user.email}</p>
        <DButton variant="secondary" size="md" className="mt-3 w-full" icon={<LogOut className="size-4" aria-hidden />} onClick={() => void signOut()}>Sign out</DButton>
        <p className="mt-2 text-footnote text-text-2">Signing out clears this device's copy.</p>
      </Card>
      <YourDataSheet open={dataOpen} onClose={() => setDataOpen(false)} email={user.email} items={outbox.items} onSync={outbox.retryNow} />
    </div>
  );
}
