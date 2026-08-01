"use client";

/**
 * Renders the first page of a PDF to a PNG File, client-side, via pdf.js.
 *
 * `targetDpi`/`maxLongSide` are the same two knobs the map-image-editor's quality picker
 * exposes: `targetDpi` is what you'd get on an unbounded canvas, `maxLongSide` is an
 * absolute pixel ceiling so an oversized physical sheet (a big poster-format plattegrond,
 * printed at A0/A1) can't blow up the canvas or the resulting file without limit. For a
 * large enough source page, `maxLongSide` — not `targetDpi` — ends up being the binding
 * constraint, silently rasterizing *below* the requested DPI; that's exactly what quality
 * complaints tend to trace back to, more often than compression downstream.
 */
export async function rasterizePdfToImageFile(
  file: File,
  { targetDpi = 200, maxLongSide = 8000 }: { targetDpi?: number; maxLongSide?: number } = {},
): Promise<File> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  // pdf.js scale 1 renders at 72 DPI (1 PDF point = 1 CSS pixel).
  const baseViewport = page.getViewport({ scale: 1 });
  const longSideAt72Dpi = Math.max(baseViewport.width, baseViewport.height);
  let scale = targetDpi / 72;
  if (longSideAt72Dpi * scale > maxLongSide) {
    scale = maxLongSide / longSideAt72Dpi;
  }
  scale = Math.max(scale, 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  await page.render({ canvas, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Kon PDF niet omzetten naar afbeelding.");

  return new File([blob], file.name.replace(/\.pdf$/i, ".png"), {
    type: "image/png",
  });
}
