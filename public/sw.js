/* Offline support for the portfolio (no build step, no dependencies).
 *
 *  - /_next/static, /images, /fonts, /icons, /gltfs : cache-first (content-hashed or rarely changing)
 *  - page navigations                        : network-first, fall back to the cached copy, then /offline
 *  - manifest.webmanifest                    : network-first, fall back to the cached copy
 *  - a navigation that goes offline           : the cached copy, then /offline
 *
 * Bump VERSION to drop all caches on the next visit.
 */
const VERSION = "v3";
const STATIC = `pf-static-${VERSION}`;
const PAGES = `pf-pages-${VERSION}`;
const CORE = ["/", "/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

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

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/_next/image") ||
  /^\/(images|fonts|icons|gltfs)\//.test(url.pathname);

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
    event.respondWith(networkFirst(request, PAGES, "/offline"));
    return;
  }
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(request, PAGES));
  }
});
