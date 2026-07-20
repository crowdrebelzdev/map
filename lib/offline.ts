"use client";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    // Make sure the worker is actually active before we start relying on it to
    // intercept and cache the requests we're about to fire.
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

export type TileBounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function tilesForBoundsAtZoom(bounds: TileBounds, z: number) {
  const max = 2 ** z - 1;
  const clamp = (n: number) => Math.min(Math.max(n, 0), max);
  const xMin = clamp(lonToTileX(bounds.minLng, z));
  const xMax = clamp(lonToTileX(bounds.maxLng, z));
  const yMin = clamp(latToTileY(bounds.maxLat, z)); // higher latitude -> smaller y
  const yMax = clamp(latToTileY(bounds.minLat, z));
  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ x, y, z });
    }
  }
  return tiles;
}

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Downloads everything the operational map needs to render this event fully
 * offline: the map style, sprite, vector tiles covering the plattegrond's
 * bounds (up to the source's maxzoom — MapLibre reuses that tile for any
 * deeper zoom via "overzoom", so nothing beyond it is needed), and the
 * plattegrond image itself. Relies on the service worker (sw.js) to actually
 * persist each response in the Cache Storage as these requests pass through it.
 */
export async function downloadMapForOffline(
  bounds: TileBounds,
  imageUrl: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  await registerServiceWorker();

  const style = await fetch(STYLE_URL).then((r) => r.json());
  const vectorSource = style.sources?.openmaptiles;
  const tileJson = vectorSource?.url ? await fetch(vectorSource.url).then((r) => r.json()) : null;
  const tileUrlTemplate: string | undefined = tileJson?.tiles?.[0];
  const maxzoom: number = tileJson?.maxzoom ?? 14;

  // The page's own JS/CSS bundles — needed so a reload can hydrate at all while
  // offline. Read straight from the DOM instead of guessing Next.js's hashed
  // chunk names.
  const assetUrls = Array.from(
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[src], link[rel="stylesheet"][href]',
    ),
  )
    .map((el) => ("src" in el ? el.src : el.href))
    .filter(Boolean);

  const urls: string[] = [window.location.href, imageUrl, STYLE_URL, ...assetUrls];
  if (vectorSource?.url) urls.push(vectorSource.url);
  if (style.sprite) {
    const spriteBase: string = style.sprite;
    urls.push(`${spriteBase}.json`, `${spriteBase}.png`, `${spriteBase}@2x.json`, `${spriteBase}@2x.png`);
  }

  if (tileUrlTemplate) {
    const zoomLevels = Array.from(new Set([6, 9, 11, 12, 13, maxzoom])).filter((z) => z <= maxzoom);
    for (const z of zoomLevels) {
      for (const tile of tilesForBoundsAtZoom(bounds, z)) {
        urls.push(
          tileUrlTemplate
            .replace("{z}", String(tile.z))
            .replace("{x}", String(tile.x))
            .replace("{y}", String(tile.y)),
        );
      }
    }
  }

  let done = 0;
  onProgress(done, urls.length);

  const concurrency = 6;
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const i = index++;
      try {
        await fetch(urls[i]);
      } catch {
        // Best-effort: one missing tile shouldn't abort the whole download.
      }
      done++;
      onProgress(done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}
