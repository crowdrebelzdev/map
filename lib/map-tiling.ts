import {
  type CornerSet,
  type Transform,
  latLngToLocalMeters,
  latLngToPixel,
  localMetersToLatLng,
} from "./geo";

/** Raw RGBA pixel buffer — width*height*4 bytes, no compression/encoding. Framework-agnostic
 * (works with browser ImageData, node-canvas, or any other source) so the warp/tiling math
 * below stays testable without a real image decoder. */
export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * Derives a stable tile-version id from an uploaded map image's URL — reuses the same
 * timestamped filename `saveMapImage` (lib/storage.ts) already generates per upload, rather
 * than minting a second, independent version id that could drift out of sync with which
 * image it belongs to. Deliberately kept in this client-safe module (not lib/storage.ts,
 * which pulls in Node-only `fs`/AWS SDK imports) since both the browser (to know which
 * tile-set path to upload into) and the server (to record/serve it) need this.
 */
export function tileVersionFromImageUrl(imageUrl: string): string {
  const filename = imageUrl.split("/").pop();
  if (!filename) throw new Error("Ongeldige plattegrond-URL.");
  return filename.replace(/\.[^.]+$/, "");
}

export type WarpedRasterBounds = {
  refLat: number;
  minEast: number;
  maxEast: number;
  minNorth: number;
  maxNorth: number;
  widthPx: number;
  heightPx: number;
  metersPerPixel: number;
};

const MAX_WARPED_DIMENSION = 16384;

/**
 * Computes the axis-aligned output raster size for a warped map image, from the source
 * image's corner placement and a target ground resolution. The output covers the corners'
 * bounding box — which, for a rotated/skewed placement, is larger than the quad itself; the
 * margin outside the quad renders fully transparent (see `generateTiles`), the same way an
 * unrotated map already has "no data" outside its rectangle once placed at an angle.
 */
export function computeWarpedRasterBounds(corners: CornerSet, metersPerPixel: number): WarpedRasterBounds {
  if (metersPerPixel <= 0) {
    throw new Error("metersPerPixel moet positief zijn.");
  }

  const refLat = (corners.tl.lat + corners.tr.lat + corners.br.lat + corners.bl.lat) / 4;
  const pts = [corners.tl, corners.tr, corners.br, corners.bl].map((c) => latLngToLocalMeters(c, refLat));
  const minEast = Math.min(...pts.map((p) => p.east));
  const maxEast = Math.max(...pts.map((p) => p.east));
  const minNorth = Math.min(...pts.map((p) => p.north));
  const maxNorth = Math.max(...pts.map((p) => p.north));

  const widthPx = Math.max(1, Math.round((maxEast - minEast) / metersPerPixel));
  const heightPx = Math.max(1, Math.round((maxNorth - minNorth) / metersPerPixel));

  if (widthPx > MAX_WARPED_DIMENSION || heightPx > MAX_WARPED_DIMENSION) {
    throw new Error(
      `Gewarpte plattegrond zou ${widthPx}x${heightPx}px worden — te groot (max ${MAX_WARPED_DIMENSION}px per zijde). Kies een grovere resolutie (grotere metersPerPixel).`,
    );
  }

  return { refLat, minEast, maxEast, minNorth, maxNorth, widthPx, heightPx, metersPerPixel };
}

/** The warped raster's real-world extent, in the form maplibre-gl's raster source `bounds`
 * option expects ([west, south, east, north] via the returned object's fields). */
export function warpedRasterLatLngBounds(b: WarpedRasterBounds): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const sw = localMetersToLatLng(b.minEast, b.minNorth, b.refLat);
  const ne = localMetersToLatLng(b.maxEast, b.maxNorth, b.refLat);
  return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
}

/** Bilinear sample of `src` at fractional pixel coords `(x, y)`. Fully transparent (all-zero)
 * outside the source's own pixel bounds — this is what turns the bounding-box margin around a
 * rotated/skewed quad into "no data" instead of stretched edge pixels. */
function sampleBilinear(src: RgbaImage, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x > src.width - 1 || y > src.height - 1) return [0, 0, 0, 0];

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, src.width - 1);
  const y1 = Math.min(y0 + 1, src.height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const at = (px: number, py: number, ch: number) => src.data[(py * src.width + px) * 4 + ch];

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch++) {
    const top = at(x0, y0, ch) * (1 - fx) + at(x1, y0, ch) * fx;
    const bottom = at(x0, y1, ch) * (1 - fx) + at(x1, y1, ch) * fx;
    out[ch] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

// --- Standard Web Mercator XYZ tiling (same scheme every raster tile consumer — maplibre-gl,
// Leaflet, the openfreemap vector tiles this app already fetches — assumes) ---

/** Same formulas as the (client-only) tile math in lib/offline.ts, duplicated here rather
 * than imported so this file stays framework-agnostic and importable from a plain test/Node
 * context — both must nonetheless keep computing the same standard grid. */
function lonToTileXFrac(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileYFrac(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Geographic bounds of standard XYZ tile (z, x, y). */
export function tileLatLngBounds(z: number, x: number, y: number) {
  return {
    west: tileXToLon(x, z),
    east: tileXToLon(x + 1, z),
    north: tileYToLat(y, z),
    south: tileYToLat(y + 1, z),
  };
}

export type MapTile = { z: number; x: number; y: number; image: RgbaImage };

// 512 rather than the more common 256: for the same ground coverage, a 512px tile is 4x
// fewer HTTP requests than 256px ones — meaningful here since a lot of the upload time is
// per-request overhead (connection + S3 processing), not raw bytes, for tiles this small
// either way. Must match the `tileSize` the raster source is rendered with (see
// event-map-view-inner.tsx) — a mismatch there would make maplibre-gl misinterpret each
// tile's pixel dimensions.
export const DEFAULT_TILE_SIZE = 512;

/**
 * Suggests a sane [minZoom, maxZoom] for a warped raster: `maxZoom` is the highest zoom
 * whose native ground resolution doesn't exceed the raster's own `metersPerPixel` (no point
 * serving tiles sharper than the source data actually is — that's pure upsampled blur).
 * `minZoom` is the zoom at which the whole bounds fits inside roughly one tile.
 *
 * `tileSize` must be the same value passed to `generateTiles` and to the raster source's
 * own `tileSize` at render time (see event-map-view-inner.tsx) — this isn't just a quality
 * knob, it's load-bearing for which (z, x, y) tiles actually get requested. maplibre-gl
 * picks which zoom to fetch based on how much screen detail a tile provides for its pixel
 * size: a 512px tile at zoom Z already supplies what a 256px tile needs zoom Z+1 for, so a
 * 512px source requests one zoom level *shallower* than a 256px one would for the same
 * visual result. Generating tiles for the wrong zoom range here means maplibre-gl asks for
 * (z, x, y) coordinates that were never generated — a blank/broken map, not just a
 * suboptimal one.
 */
export function suggestZoomRange(
  bounds: WarpedRasterBounds,
  tileSize: number = DEFAULT_TILE_SIZE,
): { minZoom: number; maxZoom: number } {
  // Web Mercator ground resolution (m/px) at zoom z, latitude `refLat`, for the *standard*
  // 256px tile reference — the 156543.03392-m/px-at-zoom-0-at-the-equator constant, scaled
  // by cos(lat) and 2^-z. A grid cell's geographic footprint at zoom z is always
  // `standardMetersPerPixelAtZoom(z) * 256`, regardless of tileSize — tileSize only changes
  // how many pixels represent that same fixed footprint (see effectiveMetersPerPixelAtZoom).
  const standardMetersPerPixelAtZoom = (z: number) =>
    (156543.03392 * Math.cos((bounds.refLat * Math.PI) / 180)) / 2 ** z;
  const effectiveMetersPerPixelAtZoom = (z: number) => standardMetersPerPixelAtZoom(z) * (256 / tileSize);

  // Stop at the first zoom whose own resolution already matches or exceeds the source's —
  // not the last one still coarser than it (an earlier version of this used `maxZoom + 1
  // >= metersPerPixel`, which systematically stopped one zoom level short: since each zoom
  // level only roughly halves the previous one's meters/pixel, that left the deepest
  // available tile up to ~2x coarser than the source itself. That gap was invisible in the
  // math but very visible on screen — it's exactly the zoom level someone lands on to read
  // text, so it's the worst possible place to be quietly serving less detail than uploaded.
  let maxZoom = 0;
  while (maxZoom < 22 && effectiveMetersPerPixelAtZoom(maxZoom) > bounds.metersPerPixel) maxZoom++;

  const spanMeters = Math.max(bounds.maxEast - bounds.minEast, bounds.maxNorth - bounds.minNorth);
  let minZoom = 0;
  while (minZoom < maxZoom && standardMetersPerPixelAtZoom(minZoom) * 256 > spanMeters) minZoom++;
  minZoom = Math.max(0, minZoom - 1);

  return { minZoom, maxZoom };
}

/**
 * Slices the *original* plattegrond image straight into a standard XYZ tile pyramid
 * covering `minZoom..maxZoom`, using `transform` (the same corner-fitted homography from
 * `computeTransform` that already drives grid/POI placement) to map each tile pixel
 * directly back to a source pixel.
 *
 * Deliberately samples `source` directly rather than going through an intermediate warped
 * raster (an earlier version of this function did): chaining two bilinear resamples — once
 * to warp, once to cut tiles — compounds their blur, which showed up as tiles visibly
 * softer than the original upload, especially on thin grid lines and text. One resample
 * per tile pixel is both sharper and cheaper (no full-raster intermediate buffer).
 */
export function generateTiles(
  source: RgbaImage,
  transform: Transform,
  bounds: WarpedRasterBounds,
  opts: { minZoom: number; maxZoom: number; tileSize?: number },
): MapTile[] {
  const tileSize = opts.tileSize ?? DEFAULT_TILE_SIZE;
  const tiles: MapTile[] = [];
  const geo = warpedRasterLatLngBounds(bounds);

  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const max = 2 ** z - 1;
    const clamp = (n: number) => Math.min(Math.max(n, 0), max);
    const xMin = clamp(Math.floor(lonToTileXFrac(geo.west, z)));
    const xMax = clamp(Math.floor(lonToTileXFrac(geo.east, z)));
    const yMin = clamp(Math.floor(latToTileYFrac(geo.north, z)));
    const yMax = clamp(Math.floor(latToTileYFrac(geo.south, z)));

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tb = tileLatLngBounds(z, x, y);

        const data = new Uint8ClampedArray(tileSize * tileSize * 4);
        for (let ty = 0; ty < tileSize; ty++) {
          // Linear in lat/lng directly (not via local-meters first): both are just a fixed
          // per-degree scale factor at this latitude — see latLngToLocalMeters — so this is
          // the same interpolation, one conversion step shorter.
          const lat = tb.north + (ty / tileSize) * (tb.south - tb.north);
          for (let tx = 0; tx < tileSize; tx++) {
            const lng = tb.west + (tx / tileSize) * (tb.east - tb.west);
            const srcPixel = latLngToPixel(transform, { lat, lng });
            const [r, g, b, a] = sampleBilinear(source, srcPixel.x, srcPixel.y);
            const i = (ty * tileSize + tx) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
          }
        }

        // A rotated/skewed placement's bounding box is bigger than the quad itself (see
        // computeWarpedRasterBounds), so some tiles at its edges can land entirely outside
        // the actual plattegrond — fully transparent, nothing to show. Skip generating,
        // encoding, and uploading those rather than shipping an empty PNG for no reason.
        let isFullyTransparent = true;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) {
            isFullyTransparent = false;
            break;
          }
        }
        if (isFullyTransparent) continue;

        tiles.push({ z, x, y, image: { data, width: tileSize, height: tileSize } });
      }
    }
  }

  return tiles;
}
