"use client";

/** Renders the first page of a PDF to a PNG File, client-side, via pdf.js. */
export async function rasterizePdfToImageFile(file: File): Promise<File> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  // pdf.js scale 1 renders at 72 DPI (1 PDF point = 1 CSS pixel) — plenty for a
  // screen mockup, but soft for a plattegrond with small printed text once you zoom
  // in on the operational map. Target real print-quality DPI instead, bounded by an
  // absolute pixel ceiling so an oversized physical sheet can't blow up the canvas
  // or the resulting file.
  const baseViewport = page.getViewport({ scale: 1 });
  const longSideAt72Dpi = Math.max(baseViewport.width, baseViewport.height);
  const targetDpi = 200;
  const maxLongSide = 8000;
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
