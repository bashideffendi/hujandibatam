/* Service worker minimal buat installability PWA — AMAN dari data basi:
   - Data realtime (API sendiri, radar MSS, NEA, tile peta/BMKG/CircleGeo, video CCTV):
     NETWORK-ONLY. Cross-origin nggak pernah disentuh sama sekali.
   - Aset statis Next (/_next/static/*, content-hashed = immutable): cache-first buat
     offline shell, DIPANGKAS ke 60 entri (tiap deploy chunk-nya ganti; tanpa pangkas
     cache tumbuh ~1,5 MB per deploy tanpa batas).
   - Navigasi/HTML: network-first (update nempel, gak stale), fallback cache pas offline. */
const SHELL = "hujan-shell-v4";
const MAX_STATIC_ENTRIES = 60;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Buang entri tertua (urutan keys() = urutan masuk) kalau melebihi batas.
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_STATIC_ENTRIES;
  if (extra > 0) await Promise.all(keys.slice(0, extra).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Cross-origin (tile, radar, NEA, BMKG, CCTV) → biarin browser handle normal.
  if (url.origin !== self.location.origin) return;

  // 1) Data realtime sendiri → selalu dari network, JANGAN di-cache (anti-basi).
  if (url.pathname.startsWith("/api/")) return;

  // 2) Aset statis Next yang content-hashed → cache-first (aman, immutable), dipangkas.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) {
                cache
                  .put(req, res.clone())
                  .then(() => trim(cache))
                  .catch(() => {});
              }
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // 3) Navigasi + manifest/ikon (same-origin) → network-first, fallback cache (offline shell).
  const isShell =
    req.mode === "navigate" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|ico|svg|webmanifest)$/.test(url.pathname);
  if (!isShell) return;
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
});
