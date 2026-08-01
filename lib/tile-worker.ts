import { computeTransform, type CornerSet } from "./geo";
import {
  computeWarpedRasterBounds,
  generateTiles,
  suggestZoomRange,
  DEFAULT_TILE_SIZE,
  type RgbaImage,
} from "./map-tiling";

/**
 * Runs the plattegrond warp + tile-cutting pipeline off the main thread, so a large upload
 * doesn't freeze the corner-placement UI. Deliberately thin: every actual computation here
 * (`computeTransform`, `generateTiles`, `suggestZoomRange`) is the same already-unit-tested
 * code from lib/geo.ts and lib/map-tiling.ts — this file only adds the postMessage plumbing
 * and PNG encoding (via OffscreenCanvas, which vitest's Node environment can't provide,
 * hence keeping it out of the tested pure-logic modules).
 *
 * PNG, not WebP: this content is grid lines and text, not photos — lossy compression
 * (WebP, even at high quality settings) visibly softens/artifacts exactly that kind of
 * high-contrast fine detail. PNG's lossless compression still does well on this content
 * (large flat-color areas), so the size cost over WebP is modest, and it fully removes
 * compression as a source of quality loss on top of the one resample generateTiles already does.
 */

export type TileWorkerRequest = {
  sourceImageData: ImageData;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet;
  metersPerPixel: number;
  tileSize?: number;
};

export type TileWorkerProgress = { type: "progress"; done: number; total: number };
export type TileWorkerResult = {
  type: "done";
  minZoom: number;
  maxZoom: number;
  tiles: { z: number; x: number; y: number; buffer: ArrayBuffer }[];
};
export type TileWorkerError = { type: "error"; message: string };
export type TileWorkerMessage = TileWorkerProgress | TileWorkerResult | TileWorkerError;

// Minimal, locally-scoped typing for the worker global — the project's tsconfig `lib`
// includes `dom` (for the rest of the app), which types `self` as `Window` and conflicts
// with the real dedicated-worker `self` this file actually runs under. Narrowing to just
// the members used here avoids pulling in `webworker` lib globally (which would itself
// conflict with `dom`) just for one file.
interface WorkerSelf {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}
const workerSelf = self as unknown as WorkerSelf;

async function rgbaToPngBuffer(image: RgbaImage): Promise<ArrayBuffer> {
  const imageData = new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kon geen 2D-canvascontext aanmaken voor tegel-encodering.");
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blob.arrayBuffer();
}

workerSelf.onmessage = async (event: MessageEvent<TileWorkerRequest>) => {
  try {
    const { sourceImageData, imageWidth, imageHeight, corners, metersPerPixel, tileSize = DEFAULT_TILE_SIZE } =
      event.data;

    const source: RgbaImage = {
      data: sourceImageData.data,
      width: sourceImageData.width,
      height: sourceImageData.height,
    };

    const transform = computeTransform(imageWidth, imageHeight, corners);
    const bounds = computeWarpedRasterBounds(corners, metersPerPixel);
    const { minZoom, maxZoom } = suggestZoomRange(bounds, tileSize);
    // Samples straight from `source` (not via an intermediate warped raster) — see
    // generateTiles' own doc comment for why that matters for quality.
    const rasterTiles = generateTiles(source, transform, bounds, { minZoom, maxZoom, tileSize });

    const results: { z: number; x: number; y: number; buffer: ArrayBuffer }[] = [];
    let done = 0;
    for (const tile of rasterTiles) {
      const buffer = await rgbaToPngBuffer(tile.image);
      results.push({ z: tile.z, x: tile.x, y: tile.y, buffer });
      done++;
      const progress: TileWorkerProgress = { type: "progress", done, total: rasterTiles.length };
      workerSelf.postMessage(progress);
    }

    const result: TileWorkerResult = { type: "done", minZoom, maxZoom, tiles: results };
    workerSelf.postMessage(
      result,
      results.map((t) => t.buffer),
    );
  } catch (err) {
    const message: TileWorkerError = {
      type: "error",
      message: err instanceof Error ? err.message : "Onbekende fout tijdens het genereren van tegels.",
    };
    workerSelf.postMessage(message);
  }
};
