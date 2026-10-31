import { useEffect, useState } from "react";
import { getApi } from "@/v1/data/client";
import type { MockHrMode } from "@/v1/data/mock-hr";

const HR_LABELS: Record<MockHrMode, string> = {
  live: "Live",
  stall: "Stall feed",
  offline: "Relay offline",
  no_contact: "No contact",
  waiting: "Waiting",
  delayed: "Delayed (15 s)",
  stale: "Stale (45 s)",
  off: "Off (not set up)",
};

/**
 * Persistent "Mock data" badge (brief: mocks are visibly labelled). Renders only when the
 * resolved backend is the dev-only mock; production builds can never resolve it. Next to it, a
 * dev control for the simulated DEMO relay (mock-hr.ts): stall the feed to walk the dashboard
 * through Live → Delayed (10 s) → No recent reading (30 s), or drop the relay (Relay offline).
 */
function DevMockBadge() {
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<MockHrMode>("live");
  const [hr, setHr] = useState<typeof import("@/v1/data/mock-hr") | null>(null);
  useEffect(() => {
    let live = true;
    void getApi().then(async (a) => {
      if (!live || a.kind !== "mock") return;
      setOn(true);
      const m = await import("@/v1/data/mock-hr");
      if (!live) return;
      setHr(m);
      setMode(m.readMockHrMode(window.localStorage));
    });
    // Another tab (the TV) switched the simulated relay: show it here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "dillan.mock.hr") return;
      void import("@/v1/data/mock-hr").then(
        (m) => live && setMode(m.readMockHrMode(window.localStorage)),
      );
    };
    window.addEventListener("storage", onStorage);
    return () => {
      live = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  if (!on) return null;
  return (
    <div className="fixed bottom-[calc(var(--nav-h)+var(--safe-b)+8px)] right-2 z-[70] flex items-center gap-2 lg:bottom-4">
      {hr && (
        <label className="flex items-center gap-1 rounded-chip border-2 border-hold bg-hold-tint px-2 py-0.5 text-footnote font-bold text-hold">
          <span>HR sim (DEMO)</span>
          <select
            aria-label="Simulated DEMO relay"
            className="bg-transparent font-bold"
            value={mode}
            onChange={(e) => {
              const m = e.target.value as MockHrMode;
              hr.writeMockHrMode(window.localStorage, m, Date.now());
              setMode(m);
            }}
          >
            {hr.MOCK_HR_MODES.map((m) => (
              <option key={m} value={m}>
                {HR_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        role="status"
        className="pointer-events-none rounded-chip border-2 border-hold bg-hold-tint px-3 py-1 text-footnote font-bold text-hold"
      >
        Mock data
      </div>
    </div>
  );
}

/** Production builds replace import.meta.env.DEV with false, so the badge (and its text) is dropped. */
export const MockBadge = import.meta.env.DEV ? DevMockBadge : () => null;
