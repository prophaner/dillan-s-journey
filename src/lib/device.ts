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
let lastVerdict: "ok" | "unavailable" | null = null;
/** AT-34: with no lasting storage, unsent items live only in this tab. */
export const localLabel = (v: "ok" | "unavailable" | "checking" | null = lastVerdict) =>
  v === "unavailable" ? "Kept in this tab only" : "Saved on this device";
/** Lower-case form for toasts: "Set 2 logged · kept in this tab only". */
export const localPhrase = () => localLabel().toLowerCase();
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
  })().then((v) => { lastVerdict = v; return v; });
  return probe;
}

export function useStorageHealth() {
  const [s, setS] = useState<"checking" | "ok" | "unavailable">("checking");
  useEffect(() => { void checkStorage().then(setS); }, []);
  return s;
}
