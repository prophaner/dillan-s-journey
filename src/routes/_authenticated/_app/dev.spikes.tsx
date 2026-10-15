import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { useOutbox } from "@/lib/use-outbox";
import { retryItem } from "@/lib/outbox";
import { detectPush, type PushSupport } from "@/lib/sw";
import { elapsedMs, formatClock, useNow, useWakeLock } from "@/lib/timer";
import { Card, PageHeader, SectionLabel } from "@/components/dillan/surfaces";
import { DButton } from "@/components/dillan/button";
import { SaveState, StatusTag } from "@/components/dillan/tags";
import { NumericInput } from "@/components/dillan/training-pieces";
import { StickyActions, useKeyboardInset } from "@/components/dillan/overlays";

export const Route = createFileRoute("/_authenticated/_app/dev/spikes")({
  head: () => pageHead("Phase 0 tests", "Browser feasibility checks for offline saving, timers and updates."),
  component: Spikes,
});

function Spikes() {
  const { user } = Route.useRouteContext();
  const ob = useOutbox(user.id);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const now = useNow(250);
  const wake = useWakeLock(timerStart !== null);
  const kb = useKeyboardInset();
  const [push, setPush] = useState<PushSupport | null>(null);
  const [storage, setStorage] = useState<string>("—");
  const [n, setN] = useState(10);

  useEffect(() => {
    setPush(detectPush());
    void navigator.storage?.estimate?.().then((e) =>
      setStorage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used of ${((e.quota ?? 0) / 1e6).toFixed(0)} MB`),
    );
    const saved = localStorage.getItem("spike:timer");
    if (saved) setTimerStart(Number(saved));
  }, []);

  return (
    <div className="pb-10">
      <PageHeader eyebrow="Phase 0" title="Browser tests" />
      <p className="mt-2 text-subhead text-text-2">Run these on your iPhone and Android phone. Nothing here is stored in your training history.</p>

      <SectionLabel>1 · Offline saving (outbox)</SectionLabel>
      <Card>
        <p className="text-subhead text-text-2">Turn on airplane mode, tap "Save test item", then turn it off. It should go from "Saved on this device" to "Synced" by itself. The server only acknowledges for now; real storage waits for your table approval.</p>
        <div className="mt-3"><SaveState state={ob.state} count={ob.pending + ob.failed} onRetry={ob.syncNow} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <DButton variant="secondary" size="md" onClick={() => void ob.add("spike", { at: Date.now() })}>Save test item</DButton>
          <DButton variant="quiet" size="md" onClick={() => void ob.syncNow()}>Sync now</DButton>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {ob.items.slice(-6).reverse().map((i) => (
            <li key={i.localId} className="flex items-center justify-between gap-2 text-footnote">
              <span className="truncate font-num tabular text-text-2">{i.kind} · {i.idempotencyKey.slice(0, 8)}</span>
              {i.status === "synced" && <StatusTag kind="done">Synced</StatusTag>}
              {i.status === "local" && <StatusTag kind="neutral">On this device</StatusTag>}
              {(i.status === "failed" || i.status === "conflict") && (
                <button type="button" onClick={() => void retryItem(i.localId)}><StatusTag kind="failed">Didn't sync · Retry</StatusTag></button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <SectionLabel>2 · Timer across a locked screen</SectionLabel>
      <Card>
        <p className="text-subhead text-text-2">Start, lock your phone for a minute, unlock. The time should be right, not paused.</p>
        <p className="mt-3 font-num text-num-m font-extrabold tabular">{timerStart ? formatClock(elapsedMs(timerStart, now || timerStart)) : "0:00"}</p>
        <p className="text-footnote text-text-2">Keep screen awake: {wake === "on" ? "on" : wake === "unavailable" ? "not available in this browser" : "off"}</p>
        <div className="mt-3 flex gap-2">
          <DButton variant="secondary" size="md" onClick={() => { const t = Date.now(); localStorage.setItem("spike:timer", String(t)); setTimerStart(t); }}>Start</DButton>
          <DButton variant="quiet" size="md" onClick={() => { localStorage.removeItem("spike:timer"); setTimerStart(null); }}>Reset</DButton>
        </div>
      </Card>

      <SectionLabel>3 · Keyboard-open layout</SectionLabel>
      <Card>
        <p className="text-subhead text-text-2">Tap the number and type. The button below should stay visible above the keyboard.</p>
        <div className="mt-4"><NumericInput label="Reps" value={n} onChange={setN} /></div>
        <p className="mt-2 text-footnote text-text-2">Keyboard height: {kb}px</p>
      </Card>
      <StickyActions className="mt-3">
        <DButton variant="secondary">Pretend Log set</DButton>
      </StickyActions>

      <SectionLabel>4 · What this browser can do</SectionLabel>
      <Card>
        <ul className="flex flex-col gap-2 text-subhead">
          <li>Notifications: {push === "supported" ? "available" : push === "needs-install" ? "only after adding to home screen (iPhone)" : push ? "not available — email reminders instead" : "—"}</li>
          <li>Storage: {storage}</li>
          <li>Updates: new versions wait until you're not in a session.</li>
        </ul>
      </Card>
    </div>
  );
}
