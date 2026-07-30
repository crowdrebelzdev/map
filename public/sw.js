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

// Serves the cached copy immediately (instant, and works offline) but always kicks
// off a network fetch in the background to refresh the cache for next time. This is
// what keeps offline-saved tiles/plattegrond/bundles from going stale forever once a
// device has real connectivity again, without making the current request wait for it.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
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
    event.respondWith(staleWhileRevalidate(event.request));
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

// Broadcasts sent via actions/broadcasts.ts's sendBroadcastPush arrive here as a Web Push
// message — shown as a native notification even if no tab is open. The payload is plain
// JSON `{ title, body }` (see lib/web-push.ts), not the Notification API's own format.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Eventkaart", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Eventkaart", {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => isMapPage(new URL(c.url)));
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    }),
  );
});
