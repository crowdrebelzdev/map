"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageOverlayEditor, type EditMode } from "@/components/image-overlay-editor";
import { EventFullscreenHeader } from "@/components/event-fullscreen-header";
import { MapVersionHistoryDialog } from "@/components/map-version-history-dialog";
import { uploadMapImage, prepareMapImageUpload, confirmMapImageUpload, saveMapCorners } from "@/actions/map";
import { saveGridConfig } from "@/actions/grid";
import { rasterizePdfToImageFile } from "@/lib/pdf-to-image";
import { resizeImageFile } from "@/lib/resize-image";
import { getContrastCasingColor } from "@/lib/grid-style";
import { useMapTileGeneration } from "@/hooks/use-map-tile-generation";
import { formatGridCode, type CornerSet, type GridLabelOrientation } from "@/lib/geo";
import type { eventMap, gridConfig } from "@/db/schema";

type ExistingMap = typeof eventMap.$inferSelect;
type ExistingGrid = typeof gridConfig.$inferSelect;

/**
 * How much detail to keep from the uploaded plattegrond, before it's warped/tiled. This is
 * the resolution the *source* is rasterized/kept at — not a tile-encoding quality knob (tiles
 * are already lossless PNG, see lib/tile-worker.ts) — so it's the one setting that actually
 * controls whether small printed text ends up legible when zoomed in: a PDF's own page size
 * can make `maxLongSide` the binding constraint rather than `targetDpi`, silently rasterizing
 * *below* the requested DPI for a large-format (e.g. A0/A1 poster) plattegrond.
 * `imageMaxDimension` is the equivalent cap for a direct image upload (photo/scan), passed to
 * resizeImageFile instead.
 *
 * Higher tiers mean a larger upload and longer client-side processing — "maximaal" can
 * approach the 40MB upload ceiling (see MAX_MAP_IMAGE_BYTES in lib/storage.ts) for a large
 * source. That ceiling is configured in this app, but AWS's own infrastructure in production
 * (Lambda/API Gateway, fronting the Amplify deploy) may impose its own lower payload limit
 * that only shows up once actually deployed — test an upload at the chosen tier in production
 * before relying on it for a live event, not just locally.
 */
const MAP_QUALITY_PRESETS = {
  standaard: { label: "Standaard", pdfDpi: 200, pdfMaxLongSide: 8000, imageMaxDimension: 2400 },
  hoog: { label: "Hoog (aanbevolen voor tekst)", pdfDpi: 300, pdfMaxLongSide: 12000, imageMaxDimension: 4000 },
  maximaal: { label: "Maximaal", pdfDpi: 400, pdfMaxLongSide: 16000, imageMaxDimension: 6000 },
} as const;
type MapQualityPreset = keyof typeof MAP_QUALITY_PRESETS;

function cornersFromExisting(existing: ExistingMap | null): CornerSet | null {
  if (!existing) return null;
  return {
    tl: { lat: existing.cornerTlLat, lng: existing.cornerTlLng },
    tr: { lat: existing.cornerTrLat, lng: existing.cornerTrLng },
    br: { lat: existing.cornerBrLat, lng: existing.cornerBrLng },
    bl: { lat: existing.cornerBlLat, lng: existing.cornerBlLng },
  };
}

function gridCornersFromExisting(existing: ExistingGrid | null): CornerSet | null {
  if (!existing) return null;
  return {
    tl: { lat: existing.cornerTlLat, lng: existing.cornerTlLng },
    tr: { lat: existing.cornerTrLat, lng: existing.cornerTrLng },
    br: { lat: existing.cornerBrLat, lng: existing.cornerBrLng },
    bl: { lat: existing.cornerBlLat, lng: existing.cornerBlLng },
  };
}

export function MapImageEditor({
  eventId,
  eventSlug,
  eventName,
  tabs,
  existingMap,
  existingGrid,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  tabs: { href: string; label: string }[];
  existingMap: ExistingMap | null;
  existingGrid: ExistingGrid | null;
}) {
  const router = useRouter();
  const [image, setImage] = useState<
    { imageUrl: string; imageWidth: number; imageHeight: number } | null
  >(
    existingMap
      ? {
          imageUrl: existingMap.imageUrl,
          imageWidth: existingMap.imageWidth,
          imageHeight: existingMap.imageHeight,
        }
      : null,
  );
  const [corners, setCorners] = useState<CornerSet | null>(cornersFromExisting(existingMap));
  const [opacity, setOpacity] = useState(0.85);
  const [quality, setQuality] = useState<MapQualityPreset>("hoog");
  const [uploading, setUploading] = useState(false);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  // Tegels genereren gebeurt op de achtergrond, ná een geslaagde saveMapCorners — zie de
  // aanroepen in handleFileChange/handleSavePlacement hieronder. Nooit blokkerend voor die
  // bestaande opslag-flow: een mislukte/onderbroken tegel-run laat de kaart gewoon op de
  // vorige tegels (of de platte afbeelding) staan.
  const tileGeneration = useMapTileGeneration(eventId, eventSlug);
  const [mode, setMode] = useState<EditMode>("image");

  const [gridCorners, setGridCorners] = useState<CornerSet | null>(
    gridCornersFromExisting(existingGrid),
  );
  const [columns, setColumns] = useState(existingGrid?.columns ?? 10);
  const [rows, setRows] = useState(existingGrid?.rows ?? 10);
  const [labelOrientation, setLabelOrientation] = useState<GridLabelOrientation>(
    existingGrid?.labelOrientation ?? "row-column",
  );
  const [labelPrefix, setLabelPrefix] = useState(existingGrid?.labelPrefix ?? "");
  const [labelLetterStart, setLabelLetterStart] = useState(existingGrid?.labelLetterStart ?? 0);
  const [labelNumberStart, setLabelNumberStart] = useState(existingGrid?.labelNumberStart ?? 1);
  const [labelLetterGroupSize, setLabelLetterGroupSize] = useState(
    existingGrid?.labelLetterGroupSize ?? 0,
  );

  const labelExampleCodes = useMemo(() => {
    const opts = {
      prefix: labelPrefix,
      letterStart: labelLetterStart,
      numberStart: labelNumberStart,
      letterGroupSize: labelLetterGroupSize,
    };
    const toColRow = (letterAxis: number, numberAxis: number) =>
      labelOrientation === "row-column"
        ? { col: numberAxis, row: letterAxis }
        : { col: letterAxis, row: numberAxis };

    const first = toColRow(0, 0);
    const secondLetterAxis = labelLetterGroupSize > 0 ? labelLetterGroupSize : 1;
    const second = toColRow(secondLetterAxis, 0);

    return [
      formatGridCode(first.col, first.row, labelOrientation, opts),
      formatGridCode(second.col, second.row, labelOrientation, opts),
    ].join(", ");
  }, [labelPrefix, labelLetterStart, labelNumberStart, labelLetterGroupSize, labelOrientation]);
  const [lineColor, setLineColor] = useState(existingGrid?.lineColor ?? "#111827");
  const [lineWidth, setLineWidth] = useState(existingGrid?.lineWidth ?? 3);
  const [casingColor, setCasingColor] = useState(
    existingGrid?.casingColor ?? getContrastCasingColor(existingGrid?.lineColor ?? "#111827"),
  );
  const [casingWidth, setCasingWidth] = useState(existingGrid?.casingWidth ?? 2);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setUploading(true);
    try {
      const preset = MAP_QUALITY_PRESETS[quality];
      const isPdf =
        rawFile.type === "application/pdf" || rawFile.name.toLowerCase().endsWith(".pdf");
      const rasterized = isPdf
        ? await rasterizePdfToImageFile(rawFile, { targetDpi: preset.pdfDpi, maxLongSide: preset.pdfMaxLongSide })
        : rawFile;
      // PDFs are already rasterized at the chosen target size above — only resize direct
      // image uploads, which can be arbitrarily large (phone photos, scans).
      const file = isPdf ? rasterized : await resizeImageFile(rasterized, preset.imageMaxDimension);

      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      // Presigned direct-to-S3 upload when available (production): the file never passes
      // through the Next.js server action at all, sidestepping a payload ceiling AWS's own
      // infrastructure enforces in front of Amplify's SSR compute — well under what this
      // app's own config allows, and only surfaced once actually deployed (see the comment
      // on getMapImageUploadPlan in lib/storage.ts). Falls back to routing the file through
      // uploadMapImage for zero-setup local dev, where there's no S3 to presign against.
      const plan = await prepareMapImageUpload(eventId, file.type);
      let result: { imageUrl: string; imageWidth: number; imageHeight: number };
      if (plan.mode === "s3") {
        const putRes = await fetch(plan.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`Uploaden naar opslag mislukt (${putRes.status}).`);
        }
        result = await confirmMapImageUpload(eventId, eventSlug, {
          imageUrl: plan.publicUrl,
          imageWidth: dims.width,
          imageHeight: dims.height,
        });
      } else {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("imageWidth", String(dims.width));
        formData.set("imageHeight", String(dims.height));
        result = await uploadMapImage(eventId, eventSlug, formData);
      }
      setImage(result);

      if (corners) {
        // Re-upload of an already-placed plattegrond: keep the existing geo-plaatsing
        // and just swap which image renders there. Persist right away so the new
        // corners+image are saved even if the admin never touches "Plaatsing opslaan".
        await saveMapCorners({
          eventId,
          eventSlug,
          imageUrl: result.imageUrl,
          imageWidth: result.imageWidth,
          imageHeight: result.imageHeight,
          corners,
        });
        router.refresh();
        toast.success("Plattegrond bijgewerkt — plaatsing is ongewijzigd gebleven.");
        // Achtergrondtaak, niet blokkerend — zie de toelichting bij useMapTileGeneration
        // hierboven. Eigen foutmelding, apart van de hoofd-opslag-foutafhandeling.
        tileGeneration.generate(result.imageUrl, result.imageWidth, result.imageHeight, corners).catch((err) => {
          toast.error(err instanceof Error ? `Tegels genereren mislukt: ${err.message}` : "Tegels genereren mislukt.");
        });
      } else {
        toast.success("Plattegrond geüpload. Plaats 'm op de kaart en pas 'm passend.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload mislukt.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSavePlacement() {
    if (!image || !corners) return;
    setSavingPlacement(true);
    try {
      await saveMapCorners({
        eventId,
        eventSlug,
        imageUrl: image.imageUrl,
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
        corners,
      });
      toast.success("Plattegrond-plaatsing opgeslagen.");
      router.refresh();
      // Achtergrondtaak, niet blokkerend — zie de toelichting bij useMapTileGeneration
      // hierboven. Eigen foutmelding, apart van de hoofd-opslag-foutafhandeling.
      tileGeneration.generate(image.imageUrl, image.imageWidth, image.imageHeight, corners).catch((err) => {
        toast.error(err instanceof Error ? `Tegels genereren mislukt: ${err.message}` : "Tegels genereren mislukt.");
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSavingPlacement(false);
    }
  }

  async function handleSaveGrid() {
    if (!gridCorners) return;
    setSavingGrid(true);
    try {
      await saveGridConfig({
        eventId,
        eventSlug,
        corners: gridCorners,
        columns,
        rows,
        labelOrientation,
        labelPrefix,
        labelLetterStart,
        labelNumberStart,
        labelLetterGroupSize,
        lineColor,
        lineWidth,
        casingColor,
        casingWidth,
      });
      toast.success("Grid opgeslagen.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSavingGrid(false);
    }
  }

  const uploadCard = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Plattegrond</CardTitle>
        {existingMap && <MapVersionHistoryDialog eventId={eventId} eventSlug={eventSlug} />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="map-quality">Detailniveau</Label>
          <Select value={quality} onValueChange={(v) => setQuality(v as MapQualityPreset)} disabled={uploading}>
            <SelectTrigger id="map-quality" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MAP_QUALITY_PRESETS).map(([key, p]) => (
                <SelectItem key={key} value={key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Hoger detailniveau geeft scherpere tekst bij inzoomen, maar een groter bestand en
            langere verwerkingstijd. Geldt voor de eerstvolgende upload.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="map-image">
            {image ? "Andere plattegrond uploaden" : "Plattegrond uploaden"}
          </Label>
          <Input
            id="map-image"
            type="file"
            accept="image/png,image/jpeg,image/webp,.pdf,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPG of PDF. Bij een PDF wordt de eerste pagina gebruikt.
          </p>
          {uploading && <p className="text-xs text-muted-foreground">Bezig met verwerken...</p>}
        </div>
      </CardContent>
    </Card>
  );

  if (!image) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-background">
        <EventFullscreenHeader eventSlug={eventSlug} eventName={eventName} tabs={tabs} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg space-y-4">{uploadCard}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-background">
      <EventFullscreenHeader eventSlug={eventSlug} eventName={eventName} tabs={tabs} />
      <div className="flex min-h-0 flex-1">
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-r p-4">
        {uploadCard}
        <Card>
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">Wat pas je aan?</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  De plattegrond en het grid zijn los van elkaar te verplaatsen, draaien en
                  schalen — kies hieronder welke van de twee de handvatten op de kaart besturen.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={mode === "image" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setMode("image")}
                  >
                    Plattegrond
                  </Button>
                  <Button
                    variant={mode === "grid" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    style={mode === "grid" ? { backgroundColor: "#9333ea" } : undefined}
                    onClick={() => setMode("grid")}
                  >
                    Grid
                  </Button>
                </div>
              </CardContent>
            </Card>

            {mode === "image" && (
              <Card>
                <CardHeader>
                  <CardTitle>Plaatsing plattegrond</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Sleep de hoeken om uit te rekken, de rand-punten om één zijde te schalen, de
                    blauwe knop om te draaien, het groene blokje om uniform te vergroten/
                    verkleinen, of het zwarte pijltjes-icoon om te verplaatsen.
                  </p>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="opacity" className="w-28 shrink-0 text-sm">
                      Doorzichtigheid
                    </Label>
                    <Slider
                      id="opacity"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={[opacity]}
                      onValueChange={(v) => setOpacity(Array.isArray(v) ? v[0] : v)}
                    />
                  </div>
                  <Button
                    onClick={handleSavePlacement}
                    disabled={!corners || savingPlacement}
                    className="w-full"
                  >
                    {savingPlacement ? "Bezig..." : "Plaatsing opslaan"}
                  </Button>
                  {/* Losstaand van bovenstaande knop/opslag — deze tegels worden op de
                      achtergrond gegenereerd, zie useMapTileGeneration hierboven. */}
                  {(tileGeneration.status === "warping" || tileGeneration.status === "uploading") && (
                    <p className="text-xs text-muted-foreground">
                      Tegels {tileGeneration.status === "warping" ? "voorbereiden" : "uploaden"}
                      {tileGeneration.progress.total > 0
                        ? ` (${tileGeneration.progress.done}/${tileGeneration.progress.total})...`
                        : "..."}
                    </p>
                  )}
                  {tileGeneration.status === "done" && (
                    <p className="text-xs text-muted-foreground">Tegels zijn bijgewerkt.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {mode === "grid" && (
              <Card>
                <CardHeader>
                  <CardTitle>Grid</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Sleep het grid net als de plattegrond passend — onafhankelijk van de
                    plattegrond zelf. Handig als het grid net niet precies uitlijnt.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="columns">Kolommen</Label>
                      <Input
                        id="columns"
                        type="number"
                        min={1}
                        value={columns}
                        onChange={(e) => setColumns(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rows">Rijen</Label>
                      <Input
                        id="rows"
                        type="number"
                        min={1}
                        value={rows}
                        onChange={(e) => setRows(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="labelOrientation">Label-richting</Label>
                    <Select
                      value={labelOrientation}
                      onValueChange={(v) => setLabelOrientation(v as GridLabelOrientation)}
                    >
                      <SelectTrigger id="labelOrientation" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="row-column">
                          Rij = letter, kolom = cijfer (bv. B3)
                        </SelectItem>
                        <SelectItem value="column-row">
                          Kolom = letter, rij = cijfer (bv. C2)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Moet overeenkomen met de labels die al op de plattegrond staan afgedrukt.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="labelPrefix">Label-prefix</Label>
                      <Input
                        id="labelPrefix"
                        value={labelPrefix}
                        onChange={(e) => setLabelPrefix(e.target.value)}
                        placeholder="bv. 10"
                        maxLength={12}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="labelLetterStart">Startletter</Label>
                      <Select
                        value={String.fromCharCode(65 + labelLetterStart)}
                        onValueChange={(v) => setLabelLetterStart((v ?? "A").charCodeAt(0) - 65)}
                      >
                        <SelectTrigger id="labelLetterStart" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(
                            (letter) => (
                              <SelectItem key={letter} value={letter}>
                                {letter}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="labelNumberStart">Startnummer</Label>
                      <Input
                        id="labelNumberStart"
                        type="number"
                        value={labelNumberStart}
                        onChange={(e) => setLabelNumberStart(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="labelLetterGroupSize">Subcellen per letter</Label>
                      <Input
                        id="labelLetterGroupSize"
                        type="number"
                        min={0}
                        value={labelLetterGroupSize}
                        onChange={(e) => setLabelLetterGroupSize(Number(e.target.value))}
                        placeholder="0 = uit"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Handig als deze plattegrond maar een deel is van een grotere, al bestaande
                    grid-indeling. Voorbeeld met deze instellingen:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {labelExampleCodes}
                    </span>
                    . Laat &quot;Subcellen per letter&quot; op 0 voor gewone codes zoals A1, B2 —
                    zet 'm bv. op 4 als elke letter-zone (zoals &quot;E&quot;) op de plattegrond
                    zelf al in 4 genummerde stukken is verdeeld.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="lineColor">Lijnkleur</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="lineColor"
                          type="color"
                          value={lineColor}
                          onChange={(e) => setLineColor(e.target.value)}
                          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
                        />
                        <Input
                          value={lineColor}
                          onChange={(e) => setLineColor(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lineWidth">Lijndikte (px)</Label>
                      <Input
                        id="lineWidth"
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={lineWidth}
                        onChange={(e) => setLineWidth(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="casingColor">Buitenlijn-kleur</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="casingColor"
                          type="color"
                          value={casingColor}
                          onChange={(e) => setCasingColor(e.target.value)}
                          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
                        />
                        <Input
                          value={casingColor}
                          onChange={(e) => setCasingColor(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="casingWidth">Buitenlijn-dikte (px)</Label>
                      <Input
                        id="casingWidth"
                        type="number"
                        min={0}
                        step={0.5}
                        value={casingWidth}
                        onChange={(e) => setCasingWidth(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Zet de buitenlijn-dikte op 0 om 'm helemaal te verbergen.
                  </p>
                  <Button
                    onClick={handleSaveGrid}
                    disabled={!gridCorners || savingGrid}
                    className="w-full"
                  >
                    {savingGrid ? "Bezig..." : "Grid opslaan"}
                  </Button>
                </CardContent>
              </Card>
            )}
      </div>

      <div className="min-w-0 flex-1">
        <ImageOverlayEditor
          imageUrl={image.imageUrl}
          imageWidth={image.imageWidth}
          imageHeight={image.imageHeight}
          corners={corners}
          onCornersChange={setCorners}
          opacity={opacity}
          gridCorners={gridCorners}
          onGridCornersChange={setGridCorners}
          gridColumns={columns}
          gridRows={rows}
          gridLabelOrientation={labelOrientation}
          gridLabelPrefix={labelPrefix}
          gridLabelLetterStart={labelLetterStart}
          gridLabelNumberStart={labelNumberStart}
          gridLabelLetterGroupSize={labelLetterGroupSize}
          gridLineColor={lineColor}
          gridLineWidth={lineWidth}
          gridCasingColor={casingColor}
          gridCasingWidth={casingWidth}
          mode={mode}
        />
      </div>
      </div>
    </div>
  );
}
