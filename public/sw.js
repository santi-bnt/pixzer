const CACHE_PREFIX = "pixzer-public-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const OFFLINE_PAGE = "/offline.html";

const PUBLIC_ASSETS = [
  OFFLINE_PAGE,
  "/brand/pixzer-logo-tv-vacia-negro.png",
  "/brand/pixzer-logo-tv-vacia-blanco.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPublicStaticAsset(url) {
  if (url.origin !== self.location.origin || url.search) return false;

  return (
    url.pathname.startsWith("/_next/static/") ||
    PUBLIC_ASSETS.includes(url.pathname)
  );
}

function mayStoreStaticResponse(pathname, response) {
  if (!response.ok || response.type !== "basic") return false;

  const cacheControl = response.headers.get("cache-control") ?? "";
  if (/\b(private|no-store)\b/i.test(cacheControl)) return false;

  if (
    pathname.startsWith("/_next/static/") &&
    !/\bimmutable\b/i.test(cacheControl)
  ) {
    return false;
  }

  return true;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match(OFFLINE_PAGE);
        return (
          fallback ??
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if (!isPublicStaticAsset(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (mayStoreStaticResponse(url.pathname, response)) {
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
