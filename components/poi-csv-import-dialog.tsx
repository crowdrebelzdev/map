"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { parseCsv } from "@/lib/csv";
import { importPoisCsv, type PoiImportResult } from "@/actions/poi";
import { POI_CSV_HEADERS, csvRecordsToImportRows } from "@/lib/poi-csv";

/** Bulk-import POIs from a CSV file shaped like the export from `PoiList` (same column
 * headers) — invalid rows (unknown category/day, bad lat/lng) are skipped and listed rather
 * than blocking the rows that do validate. */
export function PoiCsvImportDialog({ eventId, eventSlug }: { eventId: string; eventSlug: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PoiImportResult | null>(null);

  function reset() {
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const records = parseCsv(text);
      const importResult = await importPoisCsv(eventId, eventSlug, csvRecordsToImportRows(records));
      setResult(importResult);
      if (importResult.imported > 0) {
        toast.success(`${importResult.imported} POI('s) geïmporteerd.`);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Importeren mislukt.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" />}>
        <Upload />
        <span className="sr-only">Importeren vanuit CSV</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>POI's importeren vanuit CSV</DialogTitle>
          <DialogDescription>
            Gebruik hetzelfde formaat als de CSV-export: kolommen {POI_CSV_HEADERS.join(", ")}.
            Categorie en Dag worden op naam gematcht — moeten al bestaan in dit event.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={importing}
          className="text-sm"
        />

        {importing && <p className="text-sm text-muted-foreground">Bezig met importeren...</p>}

        {result && !importing && (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{result.imported}</span> POI('s) geïmporteerd
              {result.errors.length > 0 && `, ${result.errors.length} rij(en) overgeslagen`}.
            </p>
            {result.errors.length > 0 && (
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto rounded-md border p-2 pl-6 text-xs text-destructive">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Rij {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {fileName ? "Sluiten" : "Annuleren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
