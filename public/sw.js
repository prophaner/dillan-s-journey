/* Dillan service worker — app shell only. Never caches signed-in data. */
const VERSION = "dillan-shell-v2";
const PRECACHE = ["/offline.html", "/tokens.css", "/fonts/Satoshi-Variable.woff2", "/fonts/Newsreader-Variable.woff2", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/~oauth") || url.pathname.startsWith("/api") || url.pathname.startsWith("/_serverFn")) return;

  if (req.mode === "navigate") {
    // App-shell HTML only (signed-in pages render on the device, so this HTML holds no account data).
    // Network first; once loaded, offline reopens the shell (Today shows an offline banner) instead of S20.
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
          const copy = res.clone();
          const last = res.clone();
          caches.open(VERSION).then((c) => { c.put(url.pathname, copy); c.put("/__shell", last); });
        }
        return res;
      }).catch(async () => (await caches.match(url.pathname)) || (await caches.match("/__shell")) || caches.match("/offline.html")),
    );
    return;
  }
  // Hashed build assets and fonts: cache-first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
