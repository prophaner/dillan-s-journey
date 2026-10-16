import { useEffect, useState, useSyncExternalStore } from "react";
import { deleteDraft, loadDraft, saveDraft } from "./outbox";

/** Online/offline, as the browser reports it. */
export function useOnline() {
  return useSyncExternalStore(
    (f) => { window.addEventListener("online", f); window.addEventListener("offline", f); return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); }; },
    () => navigator.onLine,
    () => true,
  );
}

/** Below this much free space we treat storage as full. */
export const MIN_FREE_BYTES = 1_000_000;

export function storageVerdict(est: { quota?: number; usage?: number } | null): "ok" | "unavailable" {
  if (!est || typeof est.quota !== "number") return "ok"; // browser doesn't report; the write probe decides
  return est.quota - (est.usage ?? 0) < MIN_FREE_BYTES ? "unavailable" : "ok";
}

let probe: Promise<"ok" | "unavailable"> | null = null;
/** Startup check (AT-34): storage estimate + a real write/read/delete in IndexedDB. */
export function checkStorage() {
  probe ??= (async () => {
    try {
      const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
      if (storageVerdict(est) === "unavailable") return "unavailable";
      const key = `probe:${crypto.randomUUID()}`;
      await saveDraft(key, 1);
      const back = await loadDraft<number>(key);
      await deleteDraft(key);
      return back === 1 ? "ok" : "unavailable";
    } catch {
      return "unavailable";
    }
  })();
  return probe;
}

export function useStorageHealth() {
  const [s, setS] = useState<"checking" | "ok" | "unavailable">("checking");
  useEffect(() => { void checkStorage().then(setS); }, []);
  return s;
}
