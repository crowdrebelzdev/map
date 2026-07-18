"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  EventMapView,
  POI_CATEGORY_COLORS,
  POI_CATEGORY_LABELS,
} from "@/components/event-map-view";
import { createPoi, deletePoi } from "@/actions/poi";
import {
  computeTransform,
  computeGridCellsFromQuad,
  latLngToPixel,
  type LatLng,
} from "@/lib/geo";
import { poiCategoryValues, type PoiCategory } from "@/db/schema";
import type { eventMap, gridConfig, poi } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;

export function PoiEditor({
  eventId,
  map,
  grid,
  pois,
}: {
  eventId: string;
  map: MapRow | null;
  grid: GridRow | null;
  pois: PoiRow[];
}) {
  const router = useRouter();
  const [pendingLatLng, setPendingLatLng] = useState<LatLng | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PoiCategory>("security");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const transform = useMemo(() => {
    if (!map) return null;
    return computeTransform(map.imageWidth, map.imageHeight, {
      tl: { lat: map.cornerTlLat, lng: map.cornerTlLng },
      tr: { lat: map.cornerTrLat, lng: map.cornerTrLng },
      br: { lat: map.cornerBrLat, lng: map.cornerBrLng },
      bl: { lat: map.cornerBlLat, lng: map.cornerBlLng },
    });
  }, [map]);

  const gridCells = useMemo(() => {
    if (!grid) return [];
    return computeGridCellsFromQuad(
      {
        tl: { lat: grid.cornerTlLat, lng: grid.cornerTlLng },
        tr: { lat: grid.cornerTrLat, lng: grid.cornerTrLng },
        br: { lat: grid.cornerBrLat, lng: grid.cornerBrLng },
        bl: { lat: grid.cornerBlLat, lng: grid.cornerBlLng },
      },
      grid.columns,
      grid.rows,
      grid.labelOrientation,
    );
  }, [grid]);

  if (!map) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Stel eerst de plattegrond en ankerpunten in op het tabblad &quot;Kaart&quot; voordat je
          POI&apos;s kunt plaatsen.
        </CardContent>
      </Card>
    );
  }

  async function handleSave() {
    if (!pendingLatLng || !transform || !name.trim()) return;
    setSaving(true);
    try {
      const pixel = latLngToPixel(transform, pendingLatLng);
      await createPoi({
        eventId,
        category,
        name,
        description,
        pixelX: pixel.x,
        pixelY: pixel.y,
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng,
      });
      toast.success("POI toegevoegd.");
      setPendingLatLng(null);
      setName("");
      setDescription("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(poiId: string) {
    setDeletingId(poiId);
    try {
      await deletePoi(eventId, poiId);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>POI toevoegen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Klik op de kaart om een locatie te kiezen.
            </p>
            {pendingLatLng ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="poi-name">Naam</Label>
                  <Input id="poi-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="poi-category">Categorie</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as PoiCategory)}>
                    <SelectTrigger id="poi-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {poiCategoryValues.map((c) => (
                        <SelectItem key={c} value={c}>
                          {POI_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="poi-description">Beschrijving (optioneel)</Label>
                  <Input
                    id="poi-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!name.trim() || saving}>
                    {saving ? "Bezig..." : "Opslaan"}
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingLatLng(null)}>
                    Annuleren
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Geen locatie geselecteerd.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bestaande POI&apos;s ({pois.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pois.length === 0 && (
              <p className="text-sm text-muted-foreground">Nog geen POI&apos;s.</p>
            )}
            {pois.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: POI_CATEGORY_COLORS[p.category] }}
                  />
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="secondary">{POI_CATEGORY_LABELS[p.category]}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                >
                  Verwijderen
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="h-[70vh] overflow-hidden rounded-md border">
        <EventMapView
          mapImage={{
            imageUrl: map.imageUrl,
            corners: {
              tl: { lat: map.cornerTlLat, lng: map.cornerTlLng },
              tr: { lat: map.cornerTrLat, lng: map.cornerTrLng },
              br: { lat: map.cornerBrLat, lng: map.cornerBrLng },
              bl: { lat: map.cornerBlLat, lng: map.cornerBlLng },
            },
          }}
          gridCells={gridCells}
          pois={pois}
          onMapClick={setPendingLatLng}
          previewMarker={pendingLatLng}
        />
      </div>
    </div>
  );
}
