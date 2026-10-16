import { useEffect, useSyncExternalStore } from "react";

/**
 * Service-worker registration + update policy (05-web-platform §3, AT-32).
 * Production only, never inside the editor iframe. A waiting worker is never activated
 * mid-session: Today offers "Update" (only with no session open), and a cold start
 * with no session open activates it.
 */
let waiting: ServiceWorker | null = null;
const subs = new Set<() => void>();
const set = (w: ServiceWorker | null) => { waiting = w; subs.forEach((f) => f()); };
let started = false;

export function useRegisterServiceWorker() {
  useEffect(() => {
    if (started || !import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if (window.self !== window.top) return;
    started = true;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || location.pathname.startsWith("/session/")) return;
      reloading = true;
      window.location.reload();
    });
    const coldStart = performance.now() < 10000;
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      const check = () => {
        if (!reg.waiting || !navigator.serviceWorker.controller) return;
        if (coldStart && performance.now() < 10000 && !location.pathname.startsWith("/session/")) {
          reg.waiting.postMessage("SKIP_WAITING"); // next cold start: activate quietly
        } else set(reg.waiting);
      };
      check();
      reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", check));
    }).catch(() => undefined);
  }, []);
}

export function useUpdateReady() {
  const w = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => waiting, () => null);
  return { updateReady: !!w, applyUpdate: () => w?.postMessage("SKIP_WAITING") };
}

export type PushSupport = "supported" | "needs-install" | "unsupported";

export function detectPush(): PushSupport {
  const hasPush = "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (iOS && !standalone) return "needs-install";
  return hasPush ? "supported" : "unsupported";
}
