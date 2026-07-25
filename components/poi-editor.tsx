"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
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
import { EventMapView, type EventMapPoiCategory } from "@/components/event-map-view";
import { createPoi, updatePoi, deletePoi } from "@/actions/poi";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  computeTransform,
  computeGridCellsFromQuad,
  latLngToPixel,
  type LatLng,
} from "@/lib/geo";
import type { eventMap, gridConfig, poi, eventDay } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

const ALL_DAYS_VALUE = "__all__";

export function PoiEditor({
  eventId,
  eventSlug,
  map,
  grid,
  pois,
  categories,
  eventDays,
}: {
  eventId: string;
  eventSlug: string;
  map: MapRow | null;
  grid: GridRow | null;
  pois: PoiRow[];
  categories: EventMapPoiCategory[];
  eventDays: EventDayRow[];
}) {
  const router = useRouter();
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const eventDayById = useMemo(() => new Map(eventDays.map((d) => [d.id, d])), [eventDays]);
  const [pendingLatLng, setPendingLatLng] = useState<LatLng | null>(null);
  const [editingPoi, setEditingPoi] = useState<PoiRow | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [eventDayId, setEventDayId] = useState<string>(ALL_DAYS_VALUE);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [poiPage, setPoiPage] = useState(1);
  const POI_PAGE_SIZE = 8;
  const poiTotalPages = Math.max(1, Math.ceil(pois.length / POI_PAGE_SIZE));
  const clampedPoiPage = Math.min(poiPage, poiTotalPages);
  const visiblePois = pois.slice(
    (clampedPoiPage - 1) * POI_PAGE_SIZE,
    clampedPoiPage * POI_PAGE_SIZE,
  );

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

  function handleMapClick(latLng: LatLng) {
    setEditingPoi(null);
    setPendingLatLng(latLng);
    setName("");
    setDescription("");
    setCategoryId(categories[0]?.id ?? "");
    setEventDayId(ALL_DAYS_VALUE);
  }

  function handleStartEdit(p: PoiRow) {
    setPendingLatLng(null);
    setEditingPoi(p);
    setName(p.name);
    setDescription(p.description ?? "");
    setCategoryId(p.categoryId);
    setEventDayId(p.eventDayId ?? ALL_DAYS_VALUE);
  }

  function handleCancelForm() {
    setPendingLatLng(null);
    setEditingPoi(null);
  }

  function handleExportCsv() {
    const dayHeader = eventDays.length > 0 ? ["Dag"] : [];
    downloadCsv(
      `poi-${eventSlug}.csv`,
      ["Naam", "Categorie", "Beschrijving", "Lat", "Lng", ...dayHeader],
      pois.map((p) => [
        p.name,
        categoryById.get(p.categoryId ?? "")?.label ?? "",
        p.description ?? "",
        p.lat,
        p.lng,
        ...(eventDays.length > 0
          ? [p.eventDayId ? eventDayById.get(p.eventDayId)?.label || eventDayById.get(p.eventDayId)?.date || "" : "Alle dagen"]
          : []),
      ]),
    );
  }

  async function handleSave() {
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const resolvedEventDayId = eventDayId === ALL_DAYS_VALUE ? null : eventDayId;
      if (editingPoi) {
        await updatePoi({
          eventId,
          eventSlug,
          poiId: editingPoi.id,
          categoryId,
          name,
          description,
          eventDayId: resolvedEventDayId,
        });
        toast.success("POI bijgewerkt.");
      } else {
        if (!pendingLatLng || !transform) return;
        const pixel = latLngToPixel(transform, pendingLatLng);
        await createPoi({
          eventId,
          eventSlug,
          categoryId,
          name,
          description,
          eventDayId: resolvedEventDayId,
          pixelX: pixel.x,
          pixelY: pixel.y,
          lat: pendingLatLng.lat,
          lng: pendingLatLng.lng,
        });
        toast.success("POI toegevoegd.");
      }
      setPendingLatLng(null);
      setEditingPoi(null);
      setName("");
      setDescription("");
      setEventDayId(ALL_DAYS_VALUE);
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
      await deletePoi(eventId, eventSlug, poiId);
      toast.success("POI verwijderd.");
      if (editingPoi?.id === poiId) setEditingPoi(null);
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
            <CardTitle>{editingPoi ? "POI bewerken" : "POI toevoegen"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editingPoi && (
              <p className="text-sm text-muted-foreground">
                Klik op de kaart om een locatie te kiezen.
              </p>
            )}
            {pendingLatLng || editingPoi ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="poi-name">Naam</Label>
                  <Input id="poi-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="poi-category">Categorie</Label>
                  <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                    <SelectTrigger id="poi-category" className="w-full">
                      <SelectValue>
                        {() => categoryById.get(categoryId)?.label ?? "Kies een categorie"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {eventDays.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="poi-day">Dag</Label>
                    <Select value={eventDayId} onValueChange={(v) => setEventDayId(v ?? ALL_DAYS_VALUE)}>
                      <SelectTrigger id="poi-day" className="w-full">
                        <SelectValue>
                          {() =>
                            eventDayId === ALL_DAYS_VALUE
                              ? "Alle dagen"
                              : eventDayById.get(eventDayId)?.label ||
                                eventDayById.get(eventDayId)?.date ||
                                "Alle dagen"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_DAYS_VALUE}>Alle dagen</SelectItem>
                        {eventDays.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.label ? `${d.label} (${d.date})` : d.date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                    {saving ? "Bezig..." : editingPoi ? "Wijzigingen opslaan" : "Opslaan"}
                  </Button>
                  <Button variant="ghost" onClick={handleCancelForm}>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Bestaande POI&apos;s ({pois.length})</CardTitle>
            {pois.length > 0 && (
              <Button variant="outline" size="icon-sm" onClick={handleExportCsv}>
                <Download />
                <span className="sr-only">Exporteren als CSV</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {pois.length === 0 && (
              <p className="text-sm text-muted-foreground">Nog geen POI&apos;s.</p>
            )}
            {visiblePois.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border p-2",
                  editingPoi?.id === p.id && "border-primary bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleStartEdit(p)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryById.get(p.categoryId ?? "")?.color ?? "#64748b" }}
                  />
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="secondary">
                    {categoryById.get(p.categoryId ?? "")?.label ?? "Onbekend"}
                  </Badge>
                  {eventDays.length > 0 && p.eventDayId && (
                    <Badge variant="outline">
                      {eventDayById.get(p.eventDayId)?.label || eventDayById.get(p.eventDayId)?.date}
                    </Badge>
                  )}
                </button>
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
            {poiTotalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Pagina {clampedPoiPage} van {poiTotalPages}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPoiPage((p) => Math.max(1, p - 1))}
                    disabled={clampedPoiPage <= 1}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPoiPage((p) => Math.min(poiTotalPages, p + 1))}
                    disabled={clampedPoiPage >= poiTotalPages}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
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
          gridLineColor={grid?.lineColor}
          gridLineWidth={grid?.lineWidth}
          gridCasingColor={grid?.casingColor}
          gridCasingWidth={grid?.casingWidth}
          pois={pois}
          categories={categories}
          onMapClick={handleMapClick}
          previewMarker={pendingLatLng}
        />
      </div>
    </div>
  );
}
