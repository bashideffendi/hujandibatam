/* Service worker minimal buat installability PWA — AMAN dari data basi:
   - Data realtime (API sendiri, radar MSS, NEA, basemap tiles): NETWORK-ONLY (gak di-cache).
   - Aset statis Next (/_next/static/*, content-hashed = immutable): cache-first (buat offline shell).
   - Navigasi/HTML: network-first (update nempel, gak stale), fallback cache pas offline. */
const SHELL = "hujan-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // 1) Data realtime -> selalu dari network, JANGAN di-cache (anti-basi).
  const isData =
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("weather.gov.sg") ||
    url.hostname.includes("data.gov.sg") ||
    url.hostname.includes("basemaps.cartocdn.com");
  if (isData) return; // biarin browser handle normal (network)

  // 2) Aset statis Next yang content-hashed -> cache-first (aman, immutable).
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // 3) Navigasi/aset lain (same-origin) -> network-first, fallback cache (offline shell).
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
