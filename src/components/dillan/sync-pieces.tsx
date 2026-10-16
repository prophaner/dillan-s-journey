import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleDot, Info, RefreshCw } from "lucide-react";
import type { OutboxItem } from "@/lib/outbox";
import { isResolvable } from "@/lib/conflicts";
import { versionInUse } from "@/lib/conflicts";
import { ROUTINE_SAVE, type RoutineSavePayload } from "@/lib/plan";
import { Sheet, useToast } from "./overlays";
import { Card } from "./surfaces";
import { DButton } from "./button";

/** S21 "Your data on this phone" (AT-34). Counts come straight from this device's outbox. */
export function YourDataSheet({ open, onClose, email, items, onSync }: {
  open: boolean; onClose: () => void; email: string; items: OutboxItem[]; onSync: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const synced = items.filter((i) => i.status === "synced").length;
  const local = items.filter((i) => i.status === "local").length;
  const failed = items.filter((i) => i.status === "failed" || i.status === "conflict").length;
  const unsynced = local + failed;
  const rows = [
    { icon: <CircleCheck className="size-5 text-steady" aria-hidden />, label: "Synced", n: synced, meaning: "Stored on your account. Safe if this phone is lost." },
    { icon: <CircleDot className="size-5 text-text-3" aria-hidden />, label: "Saved on this device", n: local, meaning: "Kept here. Sends when you're online and Dillan is open." },
    { icon: <CircleAlert className="size-5 text-hold" aria-hidden />, label: "Didn't sync", n: failed, meaning: "Tried and stopped. Retry, or choose a version if it changed elsewhere." },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Your data on this phone">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex gap-3 py-3">
            {r.icon}
            <div className="min-w-0 flex-1">
              <p className="flex justify-between gap-2 text-headline font-bold"><span>{r.label}</span><span className="font-num tabular">{r.n}</span></p>
              <p className="text-footnote text-text-2">{r.meaning}</p>
            </div>
          </li>
        ))}
      </ul>
      <DButton variant="secondary" size="md" className="mt-3 w-full" loading={busy} disabled={busy}
        icon={<RefreshCw className="size-4" aria-hidden />}
        onClick={async () => { setBusy(true); try { await onSync(); } finally { setBusy(false); } }}>
        Sync now
      </DButton>
      <p className="mt-4 flex gap-2 rounded-btn bg-surface-2 p-3 text-footnote text-text-2">
        <Info className="size-4 shrink-0" aria-hidden />
        {unsynced > 0
          ? `Clearing your browser data would remove the ${unsynced} unsynced item${unsynced === 1 ? "" : "s"}. Sync first if you can.`
          : "Everything here is synced. Clearing your browser data only removes this device's copy."}
      </p>
      <p className="mt-4 text-footnote text-text-2">Signed in as {email} · Signing out clears this device's copy.</p>
    </Sheet>
  );
}

/** One card per outbox item in "conflict" (AT-21). Nothing resolves itself. */
export function ConflictCards({ items, onResolved, onDraft }: { items: OutboxItem[]; onResolved: () => void; onDraft: () => void }) {
  const list = items.filter(isResolvable);
  if (!list.length) return null;
  return <div className="mt-4 flex flex-col gap-3">{list.map((i) => <ConflictCard key={i.localId} item={i} all={items} onResolved={onResolved} onDraft={onDraft} />)}</div>;
}

type Cmp = Awaited<ReturnType<typeof import("@/lib/conflict-actions").compare>>;
const client = () => import("@/lib/conflict-actions");

function ConflictCard({ item, all, onResolved, onDraft }: { item: OutboxItem; all: OutboxItem[]; onResolved: () => void; onDraft: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cmp, setCmp] = useState<Cmp | null | "failed">(null);
  const run = async (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await f(); } catch { toast({ text: navigator.onLine ? "Couldn't do that. Try again." : "You're offline. Try again when you're back." }); } finally { setBusy(false); }
  };
  const yours = () => run(async () => {
    const r = await (await client()).keepYours(item);
    if (r === "rebased") toast({ text: "Kept yours as the newest version. The session you started on it will sync after it." });
    else if (r === "draft") { toast({ text: "Your edit is back as a draft on the newest version." }); onDraft(); }
    else if (r === "gone") toast({ text: "That item no longer exists, so there's nothing to keep." });
    onResolved();
  });
  const theirs = () => run(async () => {
    if (item.kind === ROUTINE_SAVE && versionInUse(all, (item.payload as RoutineSavePayload).id)) {
      toast({ text: "A session you started on this version hasn't synced yet, so this save has to stay until it does." });
      return;
    }
    await (await client()).keepTheirs(item);
    await qc.invalidateQueries();
    onResolved();
  });
  const show = () => run(async () => {
    try { setCmp(await (await client()).compare(item)); } catch { setCmp("failed"); }
  });
  return (
    <Card className="border-2 border-text">
      <p className="flex items-center gap-2 text-footnote font-bold uppercase tracking-wider text-text-2">
        <CircleAlert className="size-4 text-hold" aria-hidden /> Changed on another device
      </p>
      <p className="mt-2 text-headline font-bold">{item.kind === ROUTINE_SAVE || item.kind === "update:goals" ? "Your plan" : item.kind.startsWith("update:") && item.kind !== "update:sessions" ? "Your profile" : "This"} changed on another device. Keep yours, keep theirs, or compare?</p>
      {cmp === "failed" && <p className="mt-2 text-footnote text-text-2">Couldn't load their version. Check your connection.</p>}
      {cmp && cmp !== "failed" && (
        cmp.rows.length ? (
          <table className="mt-3 w-full text-left text-subhead">
            <thead><tr className="text-footnote text-text-2"><th className="py-1 font-medium"></th><th className="py-1 font-medium">Yours</th><th className="py-1 font-medium">Theirs</th></tr></thead>
            <tbody>{cmp.rows.map((r) => <tr key={r.label} className="border-t border-line"><td className="py-2 text-text-2">{r.label}</td><td className="py-2 font-num">{r.yours}</td><td className="py-2 font-num">{r.theirs}</td></tr>)}</tbody>
          </table>
        ) : (
          <div className="mt-3 text-subhead">
            <p className="text-footnote text-text-2">Yours compared with theirs ({cmp.theirsLabel}):</p>
            <ul className="mt-1 list-disc pl-5">{(cmp.lines.length ? cmp.lines : ["No differences in the exercises."]).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )
      )}
      <div className="mt-4 flex flex-col gap-2 min-[400px]:flex-row">
        <DButton variant="secondary" size="md" disabled={busy} onClick={() => void yours()}>Keep yours</DButton>
        <DButton variant="secondary" size="md" disabled={busy} onClick={() => void theirs()}>Keep theirs</DButton>
        <DButton variant="quiet" size="md" disabled={busy} onClick={() => void show()}>Compare</DButton>
      </div>
    </Card>
  );
}
