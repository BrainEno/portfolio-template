/* Offline support for the portfolio (no build step, no dependencies).
 *
 *  - _next/static, images, fonts, icons, gltfs : cache-first (content-hashed or rarely changing)
 *  - page navigations                          : network-first, fall back to the cached copy, then /offline
 *  - manifest.webmanifest                      : network-first, fall back to the cached copy
 *  - a navigation that goes offline            : the cached copy, then /offline
 *
 * No absolute paths here: a GitHub Pages project site lives under `/<repo>/`,
 * so the worker derives its own prefix from the scope it was registered with
 * (see PwaRegister). Every URL below is built from `at()`.
 *
 * Bump VERSION to drop all caches on the next visit.
 */
const VERSION = "v4";
const STATIC = `pf-static-${VERSION}`;
const PAGES = `pf-pages-${VERSION}`;
/** `""` at a domain root, `"/portfolio-template"` under a Pages project site. */
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const at = (pathname) => `${BASE}${pathname}`;
const CORE = [at("/"), at("/offline"), at("/manifest.webmanifest"), at("/icons/icon-192.png")];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) => Promise.allSettled(CORE.map((url) => cache.add(url)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![STATIC, PAGES].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const STATIC_PREFIXES = ["/_next/static/", "/_next/image", "/images/", "/fonts/", "/icons/", "/gltfs/"];
const isStaticAsset = (url) => STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(at(prefix)));

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: false });
    if (hit) return hit;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC).catch(() => new Response("", { status: 504 })));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, at("/offline")));
    return;
  }
  if (url.pathname === at("/manifest.webmanifest")) {
    event.respondWith(networkFirst(request, PAGES));
  }
});
