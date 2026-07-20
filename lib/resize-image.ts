"use client";

/**
 * Downscales + recompresses an image client-side if it exceeds `maxDimension`,
 * so oversized phone photos/scans don't slow down map loading for staff in the
 * field. Small images are returned unchanged to avoid needless quality loss.
 */
export async function resizeImageFile(
  file: File,
  maxDimension = 2400,
  quality = 0.88,
): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });

    if (img.naturalWidth <= maxDimension && img.naturalHeight <= maxDimension) {
      return file;
    }

    const scale = maxDimension / Math.max(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
