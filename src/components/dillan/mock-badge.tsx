import { useEffect, useState } from "react";
import { getApi } from "@/v1/data/client";

/**
 * Persistent "Mock data" badge (brief: mocks are visibly labelled). Renders only when the
 * resolved backend is the dev-only mock; production builds can never resolve it.
 */
function DevMockBadge() {
  const [on, setOn] = useState(false);
  useEffect(() => {
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

/** Production builds replace import.meta.env.DEV with false, so the badge (and its text) is dropped. */
export const MockBadge = import.meta.env.DEV ? DevMockBadge : () => null;
