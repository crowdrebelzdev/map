"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportEventPdf, type ExportCategory, type ExportMapImage, type ExportPoi } from "@/lib/export-event-pdf";

export function ExportEventPdfButton({
  eventName,
  map,
  pois,
  categories,
}: {
  eventName: string;
  map: ExportMapImage | null;
  pois: ExportPoi[];
  categories: ExportCategory[];
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      await exportEventPdf({ eventName, map, pois, categories });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF-export mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={busy}>
      <FileDown className="size-4" />
      {busy ? "Bezig..." : "Exporteer PDF"}
    </Button>
  );
}
