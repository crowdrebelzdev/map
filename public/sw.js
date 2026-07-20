const CACHE_NAME = "kaart-offline-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function isCacheableAsset(url) {
  if (url.hostname === "tiles.openfreemap.org") return true;
  if (url.hostname.endsWith(".amazonaws.com")) return true; // S3 plattegrond-uploads
  if (url.pathname.startsWith("/uploads/")) return true; // lokale dev-uploads
  if (url.pathname.startsWith("/_next/static/")) return true; // content-hashed, veilig te cachen
  return false;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

function isMapPage(url) {
  return /^\/events\/[^/]+\/map\/?$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // The operational map page itself: try the network first (fresh POI/grid data
  // when online), fall back to the last cached version when offline. This handles
  // both real navigations/reloads AND the plain fetch() the "offline opslaan"
  // button uses to prime this same cache entry ahead of time.
  if (isMapPage(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
});
