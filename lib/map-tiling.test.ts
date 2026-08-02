import { describe, expect, it } from "vitest";
import { computeTransform, type CornerSet } from "@/lib/geo";
import {
  computeWarpedRasterBounds,
  generateTiles,
  suggestZoomRange,
  tileLatLngBounds,
  tileVersionFromImageUrl,
  warpedRasterLatLngBounds,
  type RgbaImage,
} from "@/lib/map-tiling";

// Same non-axis-aligned placement used in geo.test.ts, so the warp is exercised against a
// realistic rotated/skewed quad rather than a trivial identity mapping.
const CORNERS: CornerSet = {
  tl: { lat: 52.3705, lng: 4.8952 },
  tr: { lat: 52.371, lng: 4.9012 },
  br: { lat: 52.3675, lng: 4.9018 },
  bl: { lat: 52.367, lng: 4.8958 },
};

const AXIS_ALIGNED: CornerSet = {
  tl: { lat: 52.001, lng: 4.9 },
  tr: { lat: 52.001, lng: 4.901 },
  br: { lat: 52.0, lng: 4.901 },
  bl: { lat: 52.0, lng: 4.9 },
};

function makeCheckerboard(width: number, height: number, cell: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWhite = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const v = isWhite ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function solidImage(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function pixelAt(img: RgbaImage, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

/** Picks a metersPerPixel so the warped output's long side is roughly `targetLongSide` px —
 * keeps the tile counts small/fast regardless of how far apart CORNERS/AXIS_ALIGNED are. */
function bounds_metersPerPixel(corners: CornerSet, targetLongSide: number): number {
  const probe = computeWarpedRasterBounds(corners, 1);
  const longSide = Math.max(probe.widthPx, probe.heightPx);
  return Math.max(longSide / targetLongSide, 1e-6);
}

describe("computeWarpedRasterBounds", () => {
  it("produces a bounding box that contains all 4 corners", () => {
    const bounds = computeWarpedRasterBounds(CORNERS, 0.1);
    const latLng = warpedRasterLatLngBounds(bounds);
    for (const c of [CORNERS.tl, CORNERS.tr, CORNERS.br, CORNERS.bl]) {
      expect(c.lat).toBeGreaterThanOrEqual(latLng.south - 1e-9);
      expect(c.lat).toBeLessThanOrEqual(latLng.north + 1e-9);
      expect(c.lng).toBeGreaterThanOrEqual(latLng.west - 1e-9);
      expect(c.lng).toBeLessThanOrEqual(latLng.east + 1e-9);
    }
  });

  it("throws for an unreasonably fine resolution instead of silently allocating a huge buffer", () => {
    expect(() => computeWarpedRasterBounds(CORNERS, 0.00001)).toThrow();
  });
});

describe("tileLatLngBounds", () => {
  it("tile (0,0,0) covers the whole world (the standard Web Mercator z=0 tile)", () => {
    const b = tileLatLngBounds(0, 0, 0);
    expect(b.west).toBeCloseTo(-180, 6);
    expect(b.east).toBeCloseTo(180, 6);
    expect(b.north).toBeCloseTo(85.0511287798, 5);
    expect(b.south).toBeCloseTo(-85.0511287798, 5);
  });

  it("splits into left/right halves at zoom 1", () => {
    const west = tileLatLngBounds(1, 0, 0);
    const east = tileLatLngBounds(1, 1, 0);
    expect(west.east).toBeCloseTo(0, 6);
    expect(east.west).toBeCloseTo(0, 6);
  });
});

describe("suggestZoomRange", () => {
  it("suggests a higher maxZoom for a finer source resolution", () => {
    const coarse = suggestZoomRange(computeWarpedRasterBounds(AXIS_ALIGNED, 1));
    const fine = suggestZoomRange(computeWarpedRasterBounds(AXIS_ALIGNED, 0.1));
    expect(fine.maxZoom).toBeGreaterThan(coarse.maxZoom);
  });

  it("returns a valid, non-inverted range", () => {
    const { minZoom, maxZoom } = suggestZoomRange(computeWarpedRasterBounds(AXIS_ALIGNED, 0.5));
    expect(minZoom).toBeGreaterThanOrEqual(0);
    expect(minZoom).toBeLessThanOrEqual(maxZoom);
  });

  it("shifts maxZoom one level shallower when tileSize doubles, for the same effective resolution", () => {
    // Load-bearing, not just an optimization: maplibre-gl itself requests one zoom level
    // shallower for a 512px tile source than a 256px one, for the same on-screen detail —
    // see this function's own doc comment. Generating the wrong range here means tiles get
    // produced for (z, x, y) coordinates the map never actually asks for. Only maxZoom's
    // formula depends on tileSize (see the function body) — minZoom is about how many
    // standard zoom-z grid cells the bounds spans, unaffected by tileSize, so it isn't
    // guaranteed to shift by the same amount (it's independently clamped to `<= maxZoom`).
    const bounds = computeWarpedRasterBounds(AXIS_ALIGNED, 0.2);
    const at256 = suggestZoomRange(bounds, 256);
    const at512 = suggestZoomRange(bounds, 512);
    expect(at512.maxZoom).toBe(at256.maxZoom - 1);
    expect(at512.minZoom).toBeLessThanOrEqual(at512.maxZoom);
  });
});

describe("generateTiles", () => {
  it("never produces more than the single global tile at zoom 0, regardless of bounds size", () => {
    const bounds = computeWarpedRasterBounds(AXIS_ALIGNED, bounds_metersPerPixel(AXIS_ALIGNED, 64));
    const transform = computeTransform(100, 100, AXIS_ALIGNED);
    const source = solidImage(100, 100, [1, 2, 3]);
    const tiles = generateTiles(source, transform, bounds, { minZoom: 0, maxZoom: 0, tileSize: 32 });
    // At zoom 0 this bounds is a speck within the single whole-world tile, so it's plausible
    // for the tile to come out fully transparent and get skipped entirely (see generateTiles'
    // own doc comment) — the invariant that actually matters is "never more than 1", not
    // "always exactly 1".
    expect(tiles.length).toBeLessThanOrEqual(1);
    if (tiles.length === 1) {
      expect(tiles[0]).toMatchObject({ z: 0, x: 0, y: 0 });
    }
  });

  it("keeps every generated tile index within the valid range for its zoom", () => {
    const bounds = computeWarpedRasterBounds(AXIS_ALIGNED, bounds_metersPerPixel(AXIS_ALIGNED, 64));
    const transform = computeTransform(100, 100, AXIS_ALIGNED);
    const source = solidImage(100, 100, [1, 2, 3]);
    // A fixed deep zoom (not suggestZoomRange's own minZoom *or* maxZoom — neither reliably
    // puts this particular small test image's content inside a sampled tile pixel, same as
    // the neighboring "carries the source image's color" test found for this identical
    // bounds setup): too shallow a zoom and the bounds can be too small a speck in too large
    // a tile to have any sampled pixel land inside it at all, making every tile fully
    // transparent (and skipped).
    const tiles = generateTiles(source, transform, bounds, { minZoom: 20, maxZoom: 20, tileSize: 16 });
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      const max = 2 ** t.z - 1;
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(max);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(max);
    }
  });

  it("carries the source image's color into its tiles", () => {
    const bounds = computeWarpedRasterBounds(AXIS_ALIGNED, bounds_metersPerPixel(AXIS_ALIGNED, 64));
    const transform = computeTransform(100, 100, AXIS_ALIGNED);
    const source = solidImage(100, 100, [10, 20, 30]);
    // A zoom level deep enough that individual tiles (~1.5m at z20) are far smaller than
    // the ~68x111m bounds guarantees several of them land entirely inside its content —
    // regardless of where exactly it sits within the global tile grid, which a "check the
    // center tile" assumption can't rely on (verified empirically: 3 zoom levels above
    // `suggestZoomRange`'s minZoom, tried first, was still not reliably deep enough).
    const tiles = generateTiles(source, transform, bounds, { minZoom: 20, maxZoom: 20, tileSize: 16 });
    const isFullyOpaqueWithColor = (t: (typeof tiles)[number]) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const p = pixelAt(t.image, x, y);
          if (p.a < 250 || p.r !== 10 || p.g !== 20 || p.b !== 30) return false;
        }
      }
      return true;
    };
    expect(tiles.some(isFullyOpaqueWithColor)).toBe(true);
  });

  it("for an axis-aligned quad, reproduces the source's checkerboard pattern without corrupting it into a solid color", () => {
    const source = makeCheckerboard(100, 100, 10);
    const transform = computeTransform(100, 100, AXIS_ALIGNED);
    const bounds = computeWarpedRasterBounds(AXIS_ALIGNED, bounds_metersPerPixel(AXIS_ALIGNED, 100));
    // maxZoom, not minZoom — see the similar comment above for why.
    const { maxZoom } = suggestZoomRange(bounds);
    const tiles = generateTiles(source, transform, bounds, { minZoom: maxZoom, maxZoom, tileSize: 100 });

    // A checkerboard has both black and white squares — if rotation/indexing were broken
    // (e.g. flipped or collapsed to one sample), the tiles would come out a single flat
    // color instead of retaining both.
    let sawWhite = false;
    let sawBlack = false;
    for (const t of tiles) {
      for (let i = 0; i < t.image.data.length; i += 4) {
        if (t.image.data[i + 3] < 200) continue; // skip transparent margin pixels
        if (t.image.data[i] > 200) sawWhite = true;
        else if (t.image.data[i] < 50) sawBlack = true;
      }
    }
    expect(sawWhite).toBe(true);
    expect(sawBlack).toBe(true);
  });

  it("is fully transparent outside the source image's own pixel bounds", () => {
    const source = makeCheckerboard(50, 50, 5);
    const transform = computeTransform(50, 50, CORNERS);
    // A deliberately coarse resolution so the bounding-box margin around the rotated quad
    // is a comfortably large number of pixels, not a razor-thin edge case — `minZoom` itself
    // is now too coarse for that (it deliberately goes several levels below "content still
    // shows up at all", see suggestZoomRange's own comment), so this steps back up from it
    // by roughly the same amount its margin grew by.
    const bounds = computeWarpedRasterBounds(CORNERS, bounds_metersPerPixel(CORNERS, 50));
    const { minZoom } = suggestZoomRange(bounds);
    const zoom = minZoom + 5;
    const tiles = generateTiles(source, transform, bounds, { minZoom: zoom, maxZoom: zoom, tileSize: 50 });

    // The bounding box's own NW corner sits outside the rotated quad for a placement that
    // isn't axis-aligned — must render transparent, not stretched source-edge pixels.
    const nwTile = tiles.reduce((best, t) => (t.x <= best.x && t.y <= best.y ? t : best));
    const corner = pixelAt(nwTile.image, 0, 0);
    expect(corner.a).toBe(0);
  });

  it("round-trips: tiles covering the raster's center land inside the source (not inverted/misplaced)", () => {
    const source = solidImage(200, 150, [255, 255, 255]);
    const transform = computeTransform(200, 150, CORNERS);
    const bounds = computeWarpedRasterBounds(CORNERS, bounds_metersPerPixel(CORNERS, 200));
    // maxZoom, not minZoom — see the similar comment further up for why.
    const { maxZoom } = suggestZoomRange(bounds);
    const tiles = generateTiles(source, transform, bounds, { minZoom: maxZoom, maxZoom, tileSize: 64 });

    // At least one generated tile should be opaque somewhere — a sanity check that the
    // whole pipeline doesn't invert/misplace the mapping and produce an all-transparent result.
    const anyOpaque = tiles.some((t) => {
      for (let i = 3; i < t.image.data.length; i += 4) {
        if (t.image.data[i] > 200) return true;
      }
      return false;
    });
    expect(anyOpaque).toBe(true);
  });
});

describe("tileVersionFromImageUrl", () => {
  it("strips the extension from an S3 URL's filename", () => {
    expect(tileVersionFromImageUrl("https://bucket.s3.eu-central-1.amazonaws.com/uploads/evt/map-1785525256904.png")).toBe(
      "map-1785525256904",
    );
  });

  it("strips the extension from a local dev URL", () => {
    expect(tileVersionFromImageUrl("/uploads/evt/map-1785525256904.jpg")).toBe("map-1785525256904");
  });

  it("throws for a URL with no filename", () => {
    expect(() => tileVersionFromImageUrl("")).toThrow();
  });
});
