"use client";

/** Renders the first page of a PDF to a PNG File, client-side, via pdf.js. */
export async function rasterizePdfToImageFile(file: File): Promise<File> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const targetLongSide = 2400;
  const longSide = Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.min(targetLongSide / longSide, 4);
  const viewport = page.getViewport({ scale: Math.max(scale, 1) });

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
