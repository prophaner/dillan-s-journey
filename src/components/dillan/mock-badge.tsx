import { useEffect, useState } from "react";
import { getApi } from "@/v1/data/client";

/**
 * Persistent "Mock data" badge (brief: mocks are visibly labelled). Renders only when the
 * resolved backend is the dev-only mock; production builds can never resolve it.
 */
export function MockBadge() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let live = true;
    void getApi().then((a) => live && setOn(a.kind === "mock"));
    return () => {
      live = false;
    };
  }, []);
  if (!on) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[calc(var(--nav-h)+var(--safe-b)+8px)] right-2 z-[70] lg:bottom-4 rounded-chip border-2 border-hold bg-hold-tint px-3 py-1 text-footnote font-bold text-hold"
    >
      Mock data
    </div>
  );
}
