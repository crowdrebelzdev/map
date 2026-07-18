"use client";

import { useState } from "react";
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
import { uploadMapImage, saveMapCorners } from "@/actions/map";
import { saveGridConfig } from "@/actions/grid";
import { rasterizePdfToImageFile } from "@/lib/pdf-to-image";
import type { CornerSet, GridLabelOrientation } from "@/lib/geo";
import type { eventMap, gridConfig } from "@/db/schema";

type ExistingMap = typeof eventMap.$inferSelect;
type ExistingGrid = typeof gridConfig.$inferSelect;

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
  existingMap,
  existingGrid,
}: {
  eventId: string;
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
  const [uploading, setUploading] = useState(false);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const [mode, setMode] = useState<EditMode>("image");

  const [gridCorners, setGridCorners] = useState<CornerSet | null>(
    gridCornersFromExisting(existingGrid),
  );
  const [columns, setColumns] = useState(existingGrid?.columns ?? 10);
  const [rows, setRows] = useState(existingGrid?.rows ?? 10);
  const [labelOrientation, setLabelOrientation] = useState<GridLabelOrientation>(
    existingGrid?.labelOrientation ?? "row-column",
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setUploading(true);
    try {
      const isPdf =
        rawFile.type === "application/pdf" || rawFile.name.toLowerCase().endsWith(".pdf");
      const file = isPdf ? await rasterizePdfToImageFile(rawFile) : rawFile;

      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      const formData = new FormData();
      formData.set("file", file);
      formData.set("imageWidth", String(dims.width));
      formData.set("imageHeight", String(dims.height));

      const result = await uploadMapImage(eventId, formData);
      setImage(result);
      setCorners(null);
      toast.success("Plattegrond geüpload. Plaats 'm op de kaart en pas 'm passend.");
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
        imageUrl: image.imageUrl,
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
        corners,
      });
      toast.success("Plattegrond-plaatsing opgeslagen.");
      router.refresh();
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
        corners: gridCorners,
        columns,
        rows,
        labelOrientation,
      });
      toast.success("Grid opgeslagen.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSavingGrid(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Plattegrond</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>

      {image && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
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

          <div className="h-[75vh] overflow-hidden rounded-md border">
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
              mode={mode}
            />
          </div>
        </div>
      )}
    </div>
  );
}
