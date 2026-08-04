"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
const MAP_QUALITY_PRESET_VALUES = {
  standaard: { pdfDpi: 200, pdfMaxLongSide: 8000, imageMaxDimension: 2400 },
  hoog: { pdfDpi: 300, pdfMaxLongSide: 12000, imageMaxDimension: 4000 },
  maximaal: { pdfDpi: 400, pdfMaxLongSide: 16000, imageMaxDimension: 6000 },
} as const;
type MapQualityPreset = keyof typeof MAP_QUALITY_PRESET_VALUES;

// A source rasterized at up to 16000px (see pdfMaxLongSide above) is fine as input for tile
// generation (each tile only ever samples a small piece of it) but exceeds the WebGL max
// texture size on many mobile GPUs (commonly 4096-8192px) when loaded as one flat image —
// which the corner-placement editor below always does. 4096 is a conservative floor that
// stays safe even on older/budget devices. See eventMap.displayImageUrl's schema comment.
const DISPLAY_MAX_DIMENSION = 4096;

// Fixed id, same pattern as useMapTileGeneration's TOAST_ID — replaces the same toast
// through voorbereiden/uploaden -> klaar/mislukt instead of stacking a new one each time.
const UPLOAD_TOAST_ID = "map-image-upload";

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
  const t = useTranslations("mapImageEditor");
  const tc = useTranslations("common");
  const QUALITY_PRESET_LABELS: Record<MapQualityPreset, string> = {
    standaard: t("qualityStandard"),
    hoog: t("qualityHigh"),
    maximaal: t("qualityMax"),
  };
  const [image, setImage] = useState<
    { imageUrl: string; displayImageUrl: string; imageWidth: number; imageHeight: number } | null
  >(
    existingMap
      ? {
          imageUrl: existingMap.imageUrl,
          // Maps saved before displayImageUrl existed fall back to the full image here.
          displayImageUrl: existingMap.displayImageUrl ?? existingMap.imageUrl,
          imageWidth: existingMap.imageWidth,
          imageHeight: existingMap.imageHeight,
        }
      : null,
  );
  const [corners, setCorners] = useState<CornerSet | null>(cornersFromExisting(existingMap));
  const [lockOrientation, setLockOrientation] = useState(existingMap?.lockOrientation ?? true);
  const [bearing, setBearing] = useState(existingMap?.bearing ?? 0);
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
    toast.loading(t("processingToast"), { id: UPLOAD_TOAST_ID });
    try {
      const preset = MAP_QUALITY_PRESET_VALUES[quality];
      const isPdf =
        rawFile.type === "application/pdf" || rawFile.name.toLowerCase().endsWith(".pdf");
      const rasterized = isPdf
        ? await rasterizePdfToImageFile(rawFile, { targetDpi: preset.pdfDpi, maxLongSide: preset.pdfMaxLongSide })
        : rawFile;
      // PDFs are already rasterized at the chosen target size above — only resize direct
      // image uploads, which can be arbitrarily large (phone photos, scans).
      const file = isPdf ? rasterized : await resizeImageFile(rasterized, preset.imageMaxDimension);
      // Separate, smaller copy for every "show this as one flat image" use (corner editor,
      // no-tiles fallback, instant preview) — see DISPLAY_MAX_DIMENSION above for why `file`
      // itself can be too large for that. resizeImageFile returns `file` unchanged (same
      // reference) when it's already within the cap, so the `!==` checks below skip a
      // redundant second upload in that case.
      const displayFile = await resizeImageFile(file, DISPLAY_MAX_DIMENSION);

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
      let result: { imageUrl: string; displayImageUrl: string; imageWidth: number; imageHeight: number };
      if (plan.mode === "s3") {
        const putRes = await fetch(plan.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(t("storageUploadErrorFmt", { status: putRes.status }));
        }
        let displayImageUrl = plan.publicUrl;
        if (displayFile !== file) {
          const displayPlan = await prepareMapImageUpload(eventId, displayFile.type, "display");
          if (displayPlan.mode !== "s3") {
            throw new Error(t("unexpectedDisplayUploadMode"));
          }
          const displayPutRes = await fetch(displayPlan.url, {
            method: "PUT",
            headers: { "Content-Type": displayFile.type },
            body: displayFile,
          });
          if (!displayPutRes.ok) {
            throw new Error(t("storageUploadErrorFmt", { status: displayPutRes.status }));
          }
          displayImageUrl = displayPlan.publicUrl;
        }
        result = await confirmMapImageUpload(eventId, eventSlug, {
          imageUrl: plan.publicUrl,
          displayImageUrl,
          imageWidth: dims.width,
          imageHeight: dims.height,
        });
      } else {
        const formData = new FormData();
        formData.set("file", file);
        if (displayFile !== file) formData.set("displayFile", displayFile);
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
          displayImageUrl: result.displayImageUrl,
          imageWidth: result.imageWidth,
          imageHeight: result.imageHeight,
          corners,
          lockOrientation,
          bearing,
        });
        router.refresh();
        toast.success(t("updatedPlacementUnchangedToast"), { id: UPLOAD_TOAST_ID });
        // Achtergrondtaak, niet blokkerend — zie de toelichting bij useMapTileGeneration
        // hierboven. De hook toont zijn eigen voortgangs-/foutmelding (eigen toast-id); hier
        // alleen de rejection opvangen zodat er geen onbehandelde promise-fout in de console komt.
        tileGeneration.generate(result.imageUrl, result.imageWidth, result.imageHeight, corners).catch(() => {});
      } else {
        toast.success(t("uploadedToast"), { id: UPLOAD_TOAST_ID });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("uploadErrorFallback"), { id: UPLOAD_TOAST_ID });
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
        displayImageUrl: image.displayImageUrl,
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
        corners,
        lockOrientation,
        bearing,
      });
      toast.success(t("placementSavedToast"));
      router.refresh();
      // Achtergrondtaak, niet blokkerend — zie de toelichting bij useMapTileGeneration
      // hierboven. De hook toont zijn eigen voortgangs-/foutmelding; hier alleen de
      // rejection opvangen zodat er geen onbehandelde promise-fout in de console komt.
      tileGeneration.generate(image.imageUrl, image.imageWidth, image.imageHeight, corners).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveErrorFallback"));
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
      toast.success(t("gridSavedToast"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveErrorFallback"));
    } finally {
      setSavingGrid(false);
    }
  }

  const uploadCard = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("title")}</CardTitle>
        {existingMap && <MapVersionHistoryDialog eventId={eventId} eventSlug={eventSlug} />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="map-quality">{t("qualityLabel")}</Label>
          <Select value={quality} onValueChange={(v) => setQuality(v as MapQualityPreset)} disabled={uploading}>
            <SelectTrigger id="map-quality" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(MAP_QUALITY_PRESET_VALUES).map((key) => (
                <SelectItem key={key} value={key}>
                  {QUALITY_PRESET_LABELS[key as MapQualityPreset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("qualityHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="map-image">
            {image ? t("uploadAnotherLabel") : t("uploadLabel")}
          </Label>
          <Input
            id="map-image"
            type="file"
            accept="image/png,image/jpeg,image/webp,.pdf,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">{t("uploadHint")}</p>
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
                <p className="mb-2 text-sm font-medium">{t("whatToAdjust")}</p>
                <p className="mb-3 text-xs text-muted-foreground">{t("adjustHint")}</p>
                <div className="flex gap-2">
                  <Button
                    variant={mode === "image" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setMode("image")}
                  >
                    {t("modeMap")}
                  </Button>
                  <Button
                    variant={mode === "grid" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    style={mode === "grid" ? { backgroundColor: "#9333ea" } : undefined}
                    onClick={() => setMode("grid")}
                  >
                    {t("modeGrid")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {mode === "image" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("placementTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{t("placementHint")}</p>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="opacity" className="w-28 shrink-0 text-sm">
                      {t("opacityLabel")}
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
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <Switch
                        id="lock-orientation"
                        checked={lockOrientation}
                        onCheckedChange={setLockOrientation}
                      />
                      <Label htmlFor="lock-orientation" className="cursor-pointer font-normal">
                        {t("lockOrientationLabel")}
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("lockOrientationHint")}</p>
                  </div>
                  <Button
                    onClick={handleSavePlacement}
                    disabled={!corners || savingPlacement}
                    className="w-full"
                  >
                    {savingPlacement ? tc("saving") : t("savePlacement")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {mode === "grid" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("gridTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{t("gridHint")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="columns">{t("columnsLabel")}</Label>
                      <Input
                        id="columns"
                        type="number"
                        min={1}
                        value={columns}
                        onChange={(e) => setColumns(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rows">{t("rowsLabel")}</Label>
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
                    <Label htmlFor="labelOrientation">{t("labelOrientationLabel")}</Label>
                    <Select
                      value={labelOrientation}
                      onValueChange={(v) => setLabelOrientation(v as GridLabelOrientation)}
                    >
                      <SelectTrigger id="labelOrientation" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="row-column">{t("orientationRowColumn")}</SelectItem>
                        <SelectItem value="column-row">{t("orientationColumnRow")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t("orientationHint")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="labelPrefix">{t("labelPrefixLabel")}</Label>
                      <Input
                        id="labelPrefix"
                        value={labelPrefix}
                        onChange={(e) => setLabelPrefix(e.target.value)}
                        placeholder={t("labelPrefixPlaceholder")}
                        maxLength={12}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="labelLetterStart">{t("startLetterLabel")}</Label>
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
                      <Label htmlFor="labelNumberStart">{t("startNumberLabel")}</Label>
                      <Input
                        id="labelNumberStart"
                        type="number"
                        value={labelNumberStart}
                        onChange={(e) => setLabelNumberStart(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="labelLetterGroupSize">{t("subcellsLabel")}</Label>
                      <Input
                        id="labelLetterGroupSize"
                        type="number"
                        min={0}
                        value={labelLetterGroupSize}
                        onChange={(e) => setLabelLetterGroupSize(Number(e.target.value))}
                        placeholder={t("subcellsPlaceholder")}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("subcellsHintBefore")}{" "}
                    <span className="font-mono font-medium text-foreground">
                      {labelExampleCodes}
                    </span>
                    {t("subcellsHintAfter")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="lineColor">{t("lineColorLabel")}</Label>
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
                      <Label htmlFor="lineWidth">{t("lineWidthLabel")}</Label>
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
                      <Label htmlFor="casingColor">{t("casingColorLabel")}</Label>
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
                      <Label htmlFor="casingWidth">{t("casingWidthLabel")}</Label>
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
                  <p className="-mt-2 text-xs text-muted-foreground">{t("casingHint")}</p>
                  <Button
                    onClick={handleSaveGrid}
                    disabled={!gridCorners || savingGrid}
                    className="w-full"
                  >
                    {savingGrid ? tc("saving") : t("saveGrid")}
                  </Button>
                </CardContent>
              </Card>
            )}
      </div>

      <div className="min-w-0 flex-1">
        <ImageOverlayEditor
          // The display (capped) copy, not the full-resolution source — the corner editor
          // needs no more pixels than a screen can show, and the full source can exceed the
          // WebGL max texture size on mobile GPUs. See DISPLAY_MAX_DIMENSION above.
          imageUrl={image.displayImageUrl}
          imageWidth={image.imageWidth}
          imageHeight={image.imageHeight}
          corners={corners}
          onCornersChange={setCorners}
          opacity={opacity}
          bearing={bearing}
          onBearingChange={setBearing}
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
