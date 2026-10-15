import { useEffect, useState } from "react";

/**
 * Service-worker registration + update policy (05-web-platform §3).
 * Production only, never inside the editor iframe. A waiting worker is held
 * while the user is on /session/*; elsewhere we offer an update banner.
 */
export function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if (window.self !== window.top) return;
    let reloading = false;
    const onController = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      const check = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          // Cold start with no open session: activate silently.
          if (!location.pathname.startsWith("/session/") && document.visibilityState === "hidden") {
            reg.waiting.postMessage("SKIP_WAITING");
          } else {
            setWaiting(reg.waiting);
          }
        }
      };
      check();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", check);
      });
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onController);
  }, []);

  const inSession = typeof location !== "undefined" && location.pathname.startsWith("/session/");
  return {
    updateReady: !!waiting && !inSession,
    applyUpdate: () => waiting?.postMessage("SKIP_WAITING"),
  };
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
