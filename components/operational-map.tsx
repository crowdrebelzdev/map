"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, LocateFixed, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EventMapView,
  POI_CATEGORY_COLORS,
  POI_CATEGORY_LABELS,
  type FlyToTarget,
} from "@/components/event-map-view";
import { computeGridCellsFromQuad, findGridCellInQuad, parseGridCode, type LatLng } from "@/lib/geo";
import { poiCategoryValues, type PoiCategory } from "@/db/schema";
import type { eventMap, gridConfig, poi } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;

type GpsStatus = "locating" | "active" | "denied" | "unavailable" | "insecure" | "unsupported";

const GPS_STATUS_MESSAGES: Record<Exclude<GpsStatus, "active">, string> = {
  locating: "Bezig met locatie zoeken...",
  denied: "Locatietoegang geweigerd.",
  unavailable: "Locatie kon niet worden bepaald.",
  insecure: "Locatie werkt alleen via HTTPS.",
  unsupported: "Dit apparaat ondersteunt geen locatie.",
};

export function OperationalMap({
  map,
  grid,
  pois,
}: {
  map: MapRow | null;
  grid: GridRow | null;
  pois: PoiRow[];
}) {
  const [query, setQuery] = useState("");
  const [visibleCategories, setVisibleCategories] = useState<PoiCategory[]>([
    ...poiCategoryValues,
  ]);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);

  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [manualPosition, setManualPosition] = useState<LatLng | null>(null);
  const [placingManually, setPlacingManually] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGpsStatus("insecure");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsStatus("unsupported");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("active");
        setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const userPosition = manualPosition ?? gpsPosition;
  const usingManualPosition = manualPosition !== null;

  const gridCorners = useMemo(() => {
    if (!grid) return null;
    return {
      tl: { lat: grid.cornerTlLat, lng: grid.cornerTlLng },
      tr: { lat: grid.cornerTrLat, lng: grid.cornerTrLng },
      br: { lat: grid.cornerBrLat, lng: grid.cornerBrLng },
      bl: { lat: grid.cornerBlLat, lng: grid.cornerBlLng },
    };
  }, [grid]);

  const gridCells = useMemo(() => {
    if (!grid || !gridCorners) return [];
    return computeGridCellsFromQuad(gridCorners, grid.columns, grid.rows, grid.labelOrientation);
  }, [grid, gridCorners]);

  const currentCell = useMemo(() => {
    if (!grid || !gridCorners || !userPosition) return null;
    return findGridCellInQuad(
      gridCorners,
      grid.columns,
      grid.rows,
      grid.labelOrientation,
      userPosition,
    );
  }, [grid, gridCorners, userPosition]);

  const gridMatch = useMemo(() => {
    if (!query.trim() || gridCells.length === 0 || !grid) return null;
    const parsed = parseGridCode(query, grid.labelOrientation);
    if (!parsed) return null;
    return gridCells.find((c) => c.col === parsed.col && c.row === parsed.row) ?? null;
  }, [query, gridCells, grid]);

  const poiMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return pois.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, pois]);

  function toggleCategory(category: PoiCategory) {
    setVisibleCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  function selectGridCell() {
    if (!gridMatch) return;
    setFlyToTarget({
      type: "bounds",
      bounds: [
        [gridMatch.latLngBounds.sw.lng, gridMatch.latLngBounds.sw.lat],
        [gridMatch.latLngBounds.ne.lng, gridMatch.latLngBounds.ne.lat],
      ],
    });
    setQuery("");
  }

  function selectPoi(p: PoiRow) {
    setFlyToTarget({ type: "point", center: { lat: p.lat, lng: p.lng }, zoom: 19 });
    setQuery("");
  }

  function handleMapClickForManualLocation(latLng: LatLng) {
    setManualPosition(latLng);
    setPlacingManually(false);
  }

  function handleStopUsingManualLocation() {
    setManualPosition(null);
    setPlacingManually(false);
  }

  if (!map) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Voor dit evenement is nog geen kaart ingesteld.
      </div>
    );
  }

  const showResults = query.trim().length > 0 && (gridMatch || poiMatches.length > 0);
  const showGpsHint = !usingManualPosition && gpsStatus !== "active" && !placingManually;

  return (
    <div className="relative h-[calc(100vh-57px)] w-full">
      <EventMapView
        className="absolute inset-0"
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
        visibleCategories={visibleCategories}
        geolocate
        flyToTarget={flyToTarget}
        userLocation={userPosition}
        onMapClick={placingManually ? handleMapClickForManualLocation : undefined}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
        <div className="pointer-events-auto w-full max-w-sm">
          <Input
            placeholder="Zoek grid-code (bv. C4) of locatie..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-background shadow-md"
          />
          {showResults && (
            <Card className="mt-1 max-h-64 overflow-y-auto py-2">
              <CardContent className="space-y-1 px-2">
                {gridMatch && (
                  <button
                    onClick={selectGridCell}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span>Grid-cel</span>
                    <Badge>{gridMatch.code}</Badge>
                  </button>
                )}
                {poiMatches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPoi(p)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: POI_CATEGORY_COLORS[p.category] }}
                    />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {POI_CATEGORY_LABELS[p.category]}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
          {poiCategoryValues.map((c) => (
            <Badge
              key={c}
              variant={visibleCategories.includes(c) ? "default" : "outline"}
              className="cursor-pointer select-none shadow-md"
              onClick={() => toggleCategory(c)}
            >
              {POI_CATEGORY_LABELS[c]}
            </Badge>
          ))}
        </div>
      </div>

      {placingManually && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-md">
            Tik op de kaart om je locatie te zetten
            <button onClick={() => setPlacingManually(false)} className="opacity-80 hover:opacity-100">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 bottom-4 z-10 flex flex-col items-end gap-2">
        {usingManualPosition ? (
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto shadow-md"
            onClick={handleStopUsingManualLocation}
          >
            <LocateFixed size={14} />
            Terug naar GPS
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto shadow-md"
            onClick={() => setPlacingManually((v) => !v)}
          >
            <MapPin size={14} />
            Locatie handmatig zetten
          </Button>
        )}
      </div>

      {currentCell && !showGpsHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background shadow-md backdrop-blur-sm">
            <MapPin size={13} />
            Je bevindt je in grid <span className="font-semibold">{currentCell.code}</span>
            {usingManualPosition && <span className="opacity-70">(handmatig)</span>}
          </div>
        </div>
      )}

      {showGpsHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background shadow-md backdrop-blur-sm">
            {GPS_STATUS_MESSAGES[gpsStatus]}
          </div>
        </div>
      )}
    </div>
  );
}
