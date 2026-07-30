import { jsPDF } from "jspdf";

export type ExportPoi = {
  name: string;
  categoryId: string;
  pixelX: number;
  pixelY: number;
};

export type ExportCategory = {
  id: string;
  label: string;
  color: string;
};

export type ExportMapImage = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Plattegrond-afbeelding kon niet geladen worden."));
    img.src = url;
  });
}

/** Renders the plattegrond plus every POI as a colored dot at its stored pixel position
 * (the same `pixelX`/`pixelY` the map view itself places markers at) onto an offscreen
 * canvas — a static snapshot that doesn't depend on a live MapLibre instance being mounted,
 * so this works from any page (event dashboard, archived events list), not just the map
 * editor itself. */
async function renderMapSnapshot(
  map: ExportMapImage,
  pois: ExportPoi[],
  categoryById: Map<string, ExportCategory>,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(map.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = map.imageWidth;
  canvas.height = map.imageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas wordt niet ondersteund.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, map.imageWidth, map.imageHeight);

  const dotRadius = Math.max(4, Math.min(map.imageWidth, map.imageHeight) * 0.006);
  for (const poi of pois) {
    const color = categoryById.get(poi.categoryId)?.color ?? "#64748b";
    ctx.beginPath();
    ctx.arc(poi.pixelX, poi.pixelY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = dotRadius * 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  return canvas;
}

/** Builds and downloads a PDF report for an event: title page, a plattegrond snapshot with
 * POI markers, and a POI list grouped by category — meant as a durable record of an event's
 * final map state (e.g. right before/after archiving it). */
export async function exportEventPdf({
  eventName,
  map,
  pois,
  categories,
}: {
  eventName: string;
  map: ExportMapImage | null;
  pois: ExportPoi[];
  categories: ExportCategory[];
}): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;

  // --- Title page ---------------------------------------------------------------------
  doc.setFontSize(24);
  doc.text(eventName, pageWidth / 2, pageHeight / 2 - 20, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(120);
  doc.text(
    `Kaart- en POI-overzicht — geëxporteerd op ${new Date().toLocaleDateString("nl-NL")}`,
    pageWidth / 2,
    pageHeight / 2 + 10,
    { align: "center" },
  );
  doc.setTextColor(0);

  // --- Map page ------------------------------------------------------------------------
  if (map) {
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const canvas = await renderMapSnapshot(map, pois, categoryById);
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2 - 24;
    const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;

    doc.addPage();
    doc.setFontSize(14);
    doc.text("Plattegrond", margin, margin);
    doc.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      (pageWidth - drawWidth) / 2,
      margin + 12,
      drawWidth,
      drawHeight,
    );
  }

  // --- POI list, grouped by category -----------------------------------------------------
  const poisByCategory = new Map<string, ExportPoi[]>();
  for (const p of pois) {
    const list = poisByCategory.get(p.categoryId) ?? [];
    list.push(p);
    poisByCategory.set(p.categoryId, list);
  }

  if (pois.length > 0) {
    doc.addPage();
    let y = margin;
    doc.setFontSize(14);
    doc.text("POI's", margin, y);
    y += 24;

    for (const category of categories) {
      const catPois = poisByCategory.get(category.id) ?? [];
      if (catPois.length === 0) continue;

      if (y > pageHeight - margin - 20) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(12);
      doc.setFillColor(category.color);
      doc.circle(margin + 4, y - 4, 4, "F");
      doc.text(`${category.label} (${catPois.length})`, margin + 16, y);
      y += 18;

      doc.setFontSize(10);
      doc.setTextColor(80);
      for (const poi of catPois.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(`• ${poi.name}`, margin + 16, y);
        y += 14;
      }
      doc.setTextColor(0);
      y += 10;
    }
  }

  doc.save(`${eventName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-rapport.pdf`);
}
