"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { distanceMeters, type CornerSet } from "@/lib/geo";
import { tileVersionFromImageUrl, DEFAULT_TILE_SIZE } from "@/lib/map-tiling";
import { prepareMapTileUpload, uploadMapTilesLocalBatch, finalizeMapTiles } from "@/actions/map";
import type { TileWorkerMessage, TileWorkerRequest } from "@/lib/tile-worker";

export type TileGenerationStatus = "idle" | "warping" | "uploading" | "done" | "error";

// Uploads go to S3, not this app's own origin, so they don't compete with the page's other
// connections for the browser's per-origin limit — pushed well past a conservative default
// since S3 comfortably handles far more concurrent PUTs than this app will ever throw at it.
const UPLOAD_CONCURRENCY = 24;
const LOCAL_BATCH_SIZE = 40;
// Local dev's fallback path (see uploadTilesLocally) — separate from UPLOAD_CONCURRENCY
// since each unit of work there is a whole batch of tiles through a server action, not one
// direct PUT; kept modest since it's not the path that matters for the live event.
const LOCAL_BATCH_CONCURRENCY = 4;

// A fixed id so every status update (voorbereiden -> uploaden -> klaar/mislukt) replaces the
// same toast instead of stacking a new one each time — this can run for a while (warping a
// large plattegrond, then uploading potentially hundreds of tiles), so it's meant to be the
// one persistent, hard-to-miss signal that something is still happening in the background.
const TOAST_ID = "map-tile-generation";

function progressSuffix(done: number, total: number): string {
  return total > 0 ? ` (${done}/${total})` : "";
}

// Shown on every loading toast while this runs — see the beforeunload guard below for why
// leaving really does lose all progress, not just pause it.
const STAY_ON_PAGE_NOTICE = " Sluit deze pagina niet.";

async function decodeToImageData(imageUrl: string): Promise<ImageData> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Kon de plattegrond-afbeelding niet ophalen voor tegel-generatie.");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kon geen 2D-canvascontext aanmaken.");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function runTileWorker(request: TileWorkerRequest, onProgress: (done: number, total: number) => void) {
  return new Promise<{ minZoom: number; maxZoom: number; tiles: { z: number; x: number; y: number; buffer: ArrayBuffer }[] }>(
    (resolve, reject) => {
      // Not `new Worker(new URL("../lib/tile-worker.ts", import.meta.url))`: verified against
      // the actual built output that Turbopack does *not* compile that pattern into a real JS
      // worker chunk here — it just copies the raw .ts source as a static asset (served with
      // Content-Type video/mp2t, since .ts collides with the MPEG-TS video extension), which
      // a browser can't execute either way. `lib/tile-worker.ts` is pre-bundled to plain JS by
      // esbuild instead (see the `build:worker` / `predev` / `prebuild` scripts in
      // package.json) and served as a static file from `public/`.
      const worker = new Worker("/tile-worker.js");

      worker.onmessage = (event: MessageEvent<TileWorkerMessage>) => {
        const msg = event.data;
        if (msg.type === "progress") {
          onProgress(msg.done, msg.total);
        } else if (msg.type === "done") {
          worker.terminate();
          resolve(msg);
        } else if (msg.type === "error") {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || "Onbekende workerfout tijdens het genereren van tegels."));
      };

      worker.postMessage(request, [request.sourceImageData.data.buffer]);
    },
  );
}

async function uploadTilesToS3(
  tiles: { z: number; x: number; y: number; buffer: ArrayBuffer }[],
  uploads: { z: number; x: number; y: number; url: string }[],
  onProgress: (done: number) => void,
) {
  const urlByKey = new Map(uploads.map((u) => [`${u.z}:${u.x}:${u.y}`, u.url]));
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < tiles.length) {
      const tile = tiles[index++];
      const url = urlByKey.get(`${tile.z}:${tile.x}:${tile.y}`);
      if (!url) continue;
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: tile.buffer });
      if (!res.ok) throw new Error(`Uploaden van tegel ${tile.z}/${tile.x}/${tile.y} mislukt (${res.status}).`);
      done++;
      onProgress(done);
    }
  }

  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
}

async function uploadTilesLocally(
  eventId: string,
  versionId: string,
  tiles: { z: number; x: number; y: number; buffer: ArrayBuffer }[],
  onProgress: (done: number) => void,
) {
  const batches: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += LOCAL_BATCH_SIZE) {
    batches.push(tiles.slice(i, i + LOCAL_BATCH_SIZE));
  }

  let index = 0;
  let done = 0;

  async function worker() {
    while (index < batches.length) {
      const batch = batches[index++];
      const formData = new FormData();
      for (const tile of batch) {
        formData.set(`${tile.z}:${tile.x}:${tile.y}`, new Blob([tile.buffer], { type: "image/png" }));
      }
      await uploadMapTilesLocalBatch(eventId, versionId, formData);
      done += batch.length;
      onProgress(done);
    }
  }

  await Promise.all(Array.from({ length: LOCAL_BATCH_CONCURRENCY }, worker));
}

/**
 * Runs the plattegrond tiling pipeline end to end — warp + tile-cutting in a Web Worker,
 * then uploading every tile, then flipping the map over to it via `finalizeMapTiles` — as a
 * background enhancement layered on top of the existing save flow, never blocking it.
 * Intended to be called *after* `saveMapCorners` already succeeded, fire-and-forget: a
 * failure here doesn't undo the corner/image save, it just leaves the map on whichever
 * tiles (or none) it already had. See actions/map.ts for the same reasoning.
 */
export function useMapTileGeneration(eventId: string, eventSlug: string) {
  const [status, setStatus] = useState<TileGenerationStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Warns before leaving/closing the tab while tiles are being warped or uploaded — both
  // happen entirely in the browser (a Web Worker, then direct-to-S3 fetches), so navigating
  // away mid-run doesn't just pause it, it abandons it, wasting everything done so far.
  // Browsers ignore custom text here for security reasons (any non-empty returnValue just
  // triggers their own generic "leave site?" prompt) — the actual explanation lives in the
  // toast message below instead, which stays readable regardless.
  useEffect(() => {
    if (status !== "warping" && status !== "uploading") return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  const generate = useCallback(
    async (imageUrl: string, imageWidth: number, imageHeight: number, corners: CornerSet) => {
      setStatus("warping");
      setProgress({ done: 0, total: 0 });
      // `toast.loading` doesn't auto-dismiss (unlike toast.success/error), which is the
      // point here — this can legitimately take a while (warping a large plattegrond, then
      // uploading potentially hundreds of tiles), and should stay visible as long as it is.
      toast.loading(`Tegels voorbereiden...${STAY_ON_PAGE_NOTICE}`, { id: TOAST_ID });

      try {
        const sourceImageData = await decodeToImageData(imageUrl);

        // The source image's own pixel density, so tiling neither fabricates detail beyond
        // what was uploaded nor throws detail away. Takes the *finest* of all 4 edges (not
        // just the top one) — a corner placement that's only approximately rectangular
        // (dragged by hand, never pixel-perfect) can have edges of slightly different
        // real-world length; picking any single edge risks underestimating the resolution
        // needed and softening the result, where overestimating it just costs a few
        // negligible extra tile pixels.
        const edgeMeters = [
          distanceMeters(corners.tl, corners.tr),
          distanceMeters(corners.bl, corners.br),
        ].map((m) => m / imageWidth);
        const edgeMetersV = [
          distanceMeters(corners.tl, corners.bl),
          distanceMeters(corners.tr, corners.br),
        ].map((m) => m / imageHeight);
        const metersPerPixel = Math.max(Math.min(...edgeMeters, ...edgeMetersV), 0.001);

        const { minZoom, maxZoom, tiles } = await runTileWorker(
          { sourceImageData, imageWidth, imageHeight, corners, metersPerPixel, tileSize: DEFAULT_TILE_SIZE },
          (done, total) => {
            setProgress({ done, total });
            toast.loading(`Tegels voorbereiden${progressSuffix(done, total)}...${STAY_ON_PAGE_NOTICE}`, { id: TOAST_ID });
          },
        );

        setStatus("uploading");
        setProgress({ done: 0, total: tiles.length });
        toast.loading(`Tegels uploaden${progressSuffix(0, tiles.length)}...${STAY_ON_PAGE_NOTICE}`, { id: TOAST_ID });

        const versionId = tileVersionFromImageUrl(imageUrl);
        const plan = await prepareMapTileUpload(
          eventId,
          versionId,
          tiles.map((t) => ({ z: t.z, x: t.x, y: t.y })),
        );

        const onUploadProgress = (done: number) => {
          setProgress({ done, total: tiles.length });
          toast.loading(`Tegels uploaden${progressSuffix(done, tiles.length)}...${STAY_ON_PAGE_NOTICE}`, { id: TOAST_ID });
        };
        if (plan.mode === "s3") {
          await uploadTilesToS3(tiles, plan.uploads, onUploadProgress);
        } else {
          await uploadTilesLocally(eventId, versionId, tiles, onUploadProgress);
        }

        await finalizeMapTiles(eventId, eventSlug, versionId, minZoom, maxZoom, DEFAULT_TILE_SIZE);
        setStatus("done");
        toast.success("Tegels zijn klaar en actief op de kaart.", { id: TOAST_ID });
      } catch (err) {
        setStatus("error");
        const message = err instanceof Error ? err.message : "Onbekende fout.";
        toast.error(`Tegels genereren mislukt: ${message}`, { id: TOAST_ID });
        throw err;
      }
    },
    [eventId, eventSlug],
  );

  return { status, progress, generate };
}
