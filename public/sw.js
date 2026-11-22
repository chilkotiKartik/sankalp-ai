/*
 * SANKALP AI service worker (web app / PWA).
 * - Opens offline: the app shell and its content-hashed bundles are cached.
 * - Never touches API, streams, uploads, signed links or portals: those always go to the network,
 *   so SOS, complaints and live data are never served stale (the app's own offline outbox handles
 *   queuing when there is no network).
 */
const VERSION = "sankalp-pwa-v1";
const SHELL = ["/", "/manifest.webmanifest", "/pwa/icon-192.png", "/pwa/icon-512.png", "/favicon.ico"];
const NEVER = /^\/(api|ws|web|widget|s|c|uploads|healthz|readyz|metrics)(\/|$)/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return; // network only

  // App navigations: network first (always the newest build), cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put("/", res.clone()));
        return res;
      }).catch(() => caches.match("/")),
    );
    return;
  }

  // Content-hashed bundles, fonts, images, leaflet: cache first, fill on first use.
  if (/^\/(_expo\/static|assets|leaflet|pwa)\//.test(url.pathname) || url.pathname === "/favicon.ico" || url.pathname === "/manifest.webmanifest") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
