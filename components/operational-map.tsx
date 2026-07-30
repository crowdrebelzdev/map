"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, LocateFixed, X, Download, Check, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { downloadMapForOffline, registerServiceWorker, type TileBounds } from "@/lib/offline";
import { updateLiveLocation } from "@/actions/live-location";
import { logSearch } from "@/actions/search-log";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PoiFilterSheet } from "@/components/poi-filter-sheet";
import { PoiSizeControl } from "@/components/poi-size-control";
import { BroadcastListener } from "@/components/broadcast-listener";
import { InstallPromptBanner } from "@/components/install-prompt-banner";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { VisitorNameGate } from "@/components/visitor-name-gate";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  EventMapView,
  type EventMapArea,
  type EventMapAreaCategory,
  type EventMapPoiCategory,
  type FlyToTarget,
} from "@/components/event-map-view";
import {
  computeGridCellsFromQuad,
  distanceMeters,
  findGridCellInQuad,
  parseGridCode,
  type GridCell,
  type LatLng,
} from "@/lib/geo";
import type { listMyMessages } from "@/actions/broadcasts";
import type { eventMap, gridConfig, poi, eventDay, PublicAccessMode } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

const ALL_DAYS_VALUE = "__all__";

const visibleCategoriesKey = (eventId: string) => `visible-categories-${eventId}`;
const visibleAreaCategoriesKey = (eventId: string) => `visible-area-categories-${eventId}`;

/** Reads a JSON array of ids back out of localStorage (e.g. a saved category-visibility
 * filter) — falls back safely on the server (no `window`), a first-ever visit (nothing
 * stored yet), or corrupted/foreign data in that key. */
function readStoredIds(key: string, fallback: string[]): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : fallback;
  } catch {
    return fallback;
  }
}

type GpsStatus = "locating" | "active" | "denied" | "unavailable" | "insecure" | "unsupported";

const GPS_STATUS_MESSAGES: Record<Exclude<GpsStatus, "active">, string> = {
  locating: "Bezig met locatie zoeken...",
  denied: "Locatietoegang geweigerd.",
  unavailable: "Locatie kon niet worden bepaald.",
  insecure: "Locatie werkt alleen via HTTPS.",
  unsupported: "Dit apparaat ondersteunt geen locatie.",
};

export function OperationalMap({
  eventId,
  eventSlug,
  currentUserId,
  isStaff,
  publicAccessMode,
  map,
  grid,
  pois,
  categories,
  areas,
  areaCategories,
  eventDays,
  initialMessages,
}: {
  eventId: string;
  eventSlug: string;
  currentUserId: string | null;
  /** Real teamlid/org-admin, as opposed to a "public" visitor let in via `publicAccessMode` —
   * gates live-ops features (live locatie delen, broadcasts, push) that need a real account. */
  isStaff: boolean;
  publicAccessMode: PublicAccessMode;
  map: MapRow | null;
  grid: GridRow | null;
  pois: PoiRow[];
  categories: EventMapPoiCategory[];
  areas: EventMapArea[];
  areaCategories: EventMapAreaCategory[];
  eventDays: EventDayRow[];
  initialMessages: Awaited<ReturnType<typeof listMyMessages>>;
}) {
  const [query, setQuery] = useState("");
  const [visibleCategories, setVisibleCategories] = useState<string[]>(() =>
    readStoredIds(visibleCategoriesKey(eventId), categories.map((c) => c.id)),
  );
  const [visibleAreaCategoryIds, setVisibleAreaCategoryIds] = useState<string[]>(() =>
    readStoredIds(visibleAreaCategoriesKey(eventId), areaCategories.map((c) => c.id)),
  );

  // A freshly created category isn't in `visibleCategories` yet — without this it'd default
  // to hidden in the filters. Tracked against the ids seen on the *previous* render (not
  // against `visibleCategories` itself), so a category the visitor deliberately hid isn't
  // mistaken for a brand-new one and silently re-shown on every render/reload.
  const knownCategoryIdsRef = useRef<Set<string>>(new Set(categories.map((c) => c.id)));
  useEffect(() => {
    const currentIds = categories.map((c) => c.id);
    const newlyAppeared = currentIds.filter((id) => !knownCategoryIdsRef.current.has(id));
    knownCategoryIdsRef.current = new Set(currentIds);
    if (newlyAppeared.length === 0) return;
    setVisibleCategories((prev) => [...prev, ...newlyAppeared.filter((id) => !prev.includes(id))]);
  }, [categories]);

  // Persist filter choices so a refresh (or coming back later) doesn't reset to "alles
  // zichtbaar" — separate from the "auto-add new category" effect above, which still runs
  // on top of whatever was restored here.
  useEffect(() => {
    localStorage.setItem(visibleCategoriesKey(eventId), JSON.stringify(visibleCategories));
  }, [eventId, visibleCategories]);

  useEffect(() => {
    localStorage.setItem(visibleAreaCategoriesKey(eventId), JSON.stringify(visibleAreaCategoryIds));
  }, [eventId, visibleAreaCategoryIds]);

  const knownAreaCategoryIdsRef = useRef<Set<string>>(new Set(areaCategories.map((c) => c.id)));
  useEffect(() => {
    const currentIds = areaCategories.map((c) => c.id);
    const newlyAppeared = currentIds.filter((id) => !knownAreaCategoryIdsRef.current.has(id));
    knownAreaCategoryIdsRef.current = new Set(currentIds);
    if (newlyAppeared.length === 0) return;
    setVisibleAreaCategoryIds((prev) => [...prev, ...newlyAppeared.filter((id) => !prev.includes(id))]);
  }, [areaCategories]);

  const [poiSizeMultiplier, setPoiSizeMultiplier] = useState(1);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const [selectedDayId, setSelectedDayId] = useState<string>(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return eventDays.find((d) => d.date === todayIso)?.id ?? ALL_DAYS_VALUE;
  });
  const visiblePois = useMemo(() => {
    const byDay =
      selectedDayId === ALL_DAYS_VALUE
        ? pois
        : pois.filter((p) => !p.eventDayId || p.eventDayId === selectedDayId);
    const nowHHMM = new Date().toTimeString().slice(0, 5);
    return byDay.filter((p) => {
      if (!p.startTime || !p.endTime) return true;
      return nowHHMM >= p.startTime && nowHHMM <= p.endTime;
    });
  }, [pois, selectedDayId]);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [highlightedCell, setHighlightedCell] = useState<GridCell | null>(null);

  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("locating");
  const [manualPosition, setManualPosition] = useState<LatLng | null>(null);
  const [placingManually, setPlacingManually] = useState(false);
  // Latest *real* GPS fix, kept in a ref (not state) so the periodic live-location
  // upload below can read it without re-running on every high-frequency GPS tick.
  const latestGpsRef = useRef<LatLng | null>(null);

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
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsPosition(next);
        latestGpsRef.current = next;
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        latestGpsRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Automatically and periodically share the real GPS position while this page is open
  // — powers the backoffice "live locations" view. Best-effort: a failed upload (flaky
  // signal) is silently dropped rather than shown to the field user. Public (non-staff)
  // visitors never share their location with the command center — the action requires a
  // real account anyway, and would just fail for them.
  useEffect(() => {
    if (!isStaff) return;
    const id = setInterval(() => {
      const pos = latestGpsRef.current;
      if (!pos) return;
      updateLiveLocation(eventId, pos.lat, pos.lng, null).catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
  }, [eventId, isStaff]);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState<"idle" | "downloading" | "done" | "error">(
    "idle",
  );
  const [offlineProgress, setOfflineProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    registerServiceWorker();
    if (map && localStorage.getItem(`offline-map-${map.eventId}`)) {
      setOfflineStatus("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId]);

  async function runOfflineDownload(mapRow: MapRow, silent: boolean) {
    setOfflineStatus("downloading");
    setOfflineProgress({ done: 0, total: 0 });
    try {
      const lats = [mapRow.cornerTlLat, mapRow.cornerTrLat, mapRow.cornerBrLat, mapRow.cornerBlLat];
      const lngs = [mapRow.cornerTlLng, mapRow.cornerTrLng, mapRow.cornerBrLng, mapRow.cornerBlLng];
      const bounds: TileBounds = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      };
      await downloadMapForOffline(bounds, mapRow.imageUrl, (done, total) =>
        setOfflineProgress({ done, total }),
      );
      localStorage.setItem(`offline-map-${mapRow.eventId}`, String(Date.now()));
      setOfflineStatus("done");
      if (!silent) toast.success("Kaart offline opgeslagen.");
    } catch {
      setOfflineStatus("error");
      // A failed silent background refresh isn't user-actionable (probably just a
      // flaky connection) and the existing offline copy still works fine, so only
      // surface an error for an explicit, user-initiated download.
      if (!silent) toast.error("Offline opslaan mislukt. Probeer het opnieuw.");
    }
  }

  function handleDownloadOffline() {
    if (!map) return;
    runOfflineDownload(map, false);
  }

  // Whenever the device (re)gains connectivity, silently refresh the offline copy for
  // events that were already saved for offline use — so it never goes stale, without
  // requiring anyone to remember to press the button again.
  useEffect(() => {
    if (!map || !isOnline) return;
    if (!localStorage.getItem(`offline-map-${map.eventId}`)) return;
    runOfflineDownload(map, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId, isOnline]);

  const offlineDownloadButton = useMemo(() => {
    const icon =
      offlineStatus === "done" ? (
        <Check size={16} />
      ) : offlineStatus === "downloading" ? (
        <Download size={16} className="animate-pulse" />
      ) : (
        <Download size={16} />
      );
    const label =
      offlineStatus === "done"
        ? "Kaart is offline beschikbaar"
        : offlineStatus === "downloading"
          ? `Kaart offline opslaan... ${offlineProgress.done}/${offlineProgress.total || "?"}`
          : offlineStatus === "error"
            ? "Offline opslaan mislukt — klik om opnieuw te proberen"
            : "Kaart offline opslaan";
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "pointer-events-auto shrink-0 shadow-md",
                offlineStatus === "done" && "text-emerald-600",
              )}
              disabled={offlineStatus === "downloading"}
            />
          }
          onClick={offlineStatus === "downloading" || offlineStatus === "done" ? undefined : handleDownloadOffline}
        >
          {icon}
          <span className="sr-only">{label}</span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineStatus, offlineProgress.done, offlineProgress.total]);

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

  const gridLabelOptions = useMemo(
    () =>
      grid
        ? {
            prefix: grid.labelPrefix,
            letterStart: grid.labelLetterStart,
            numberStart: grid.labelNumberStart,
            letterGroupSize: grid.labelLetterGroupSize,
          }
        : undefined,
    [grid],
  );

  const gridCells = useMemo(() => {
    if (!grid || !gridCorners) return [];
    return computeGridCellsFromQuad(
      gridCorners,
      grid.columns,
      grid.rows,
      grid.labelOrientation,
      gridLabelOptions,
    );
  }, [grid, gridCorners, gridLabelOptions]);

  const currentCell = useMemo(() => {
    if (!grid || !gridCorners || !userPosition) return null;
    return findGridCellInQuad(
      gridCorners,
      grid.columns,
      grid.rows,
      grid.labelOrientation,
      userPosition,
      gridLabelOptions,
    );
  }, [grid, gridCorners, userPosition, gridLabelOptions]);

  const gridMatch = useMemo(() => {
    if (!query.trim() || gridCells.length === 0 || !grid) return null;
    const parsed = parseGridCode(query, grid.labelOrientation, gridLabelOptions);
    if (!parsed) return null;
    return gridCells.find((c) => c.col === parsed.col && c.row === parsed.row) ?? null;
  }, [query, gridCells, grid, gridLabelOptions]);

  const poiMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const matches = visiblePois.filter((p) => p.name.toLowerCase().includes(q));
    // Closest-first when we know where the user is — falls back to source order (as before)
    // once no position is available yet (GPS still starting up, permission denied, etc.).
    if (userPosition) {
      matches.sort(
        (a, b) => distanceMeters(userPosition, a) - distanceMeters(userPosition, b),
      );
    }
    return matches.slice(0, 6);
  }, [query, visiblePois, userPosition]);

  function toggleCategory(categoryId: string) {
    setVisibleCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId],
    );
  }

  function toggleAreaCategory(categoryId: string) {
    setVisibleAreaCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId],
    );
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setHighlightedCell(null);
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
    setHighlightedCell(gridMatch);
    setQuery("");
    if (isStaff) logSearch(eventId, "grid", gridMatch.code).catch(() => {});
  }

  function selectPoi(p: PoiRow) {
    setFlyToTarget({ type: "point", center: { lat: p.lat, lng: p.lng }, zoom: 19 });
    setHighlightedCell(null);
    setQuery("");
    if (isStaff) logSearch(eventId, "poi", p.name).catch(() => {});
  }

  function handleMapClickForManualLocation(latLng: LatLng) {
    setManualPosition(latLng);
    setPlacingManually(false);
  }

  function handleStopUsingManualLocation() {
    setManualPosition(null);
    setPlacingManually(false);
  }

  const needsNameGate = !isStaff && publicAccessMode === "public_named";

  if (!map) {
    const empty = (
      <div className="p-4 text-sm text-muted-foreground">
        Voor dit evenement is nog geen kaart ingesteld.
      </div>
    );
    return needsNameGate ? <VisitorNameGate eventId={eventId}>{empty}</VisitorNameGate> : empty;
  }

  const showResults = query.trim().length > 0 && (gridMatch || poiMatches.length > 0);
  const showGpsHint = !usingManualPosition && gpsStatus !== "active" && !placingManually;
  // Only offer manual placement when it's actually useful: no automatic position yet,
  // or the automatic position falls outside the grid.
  const showManualLocationButton = !usingManualPosition && (placingManually || !currentCell);

  const content = (
    <div className="relative h-full w-full overflow-hidden">
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
        gridLineColor={grid?.lineColor}
        gridLineWidth={grid?.lineWidth}
        gridCasingColor={grid?.casingColor}
        gridCasingWidth={grid?.casingWidth}
        highlightedCell={highlightedCell}
        pois={visiblePois}
        categories={categories}
        visibleCategories={visibleCategories}
        areas={areas}
        areaCategories={areaCategories}
        visibleAreaCategoryIds={visibleAreaCategoryIds}
        poiSizeMultiplier={poiSizeMultiplier}
        geolocate
        flyToTarget={flyToTarget}
        userLocation={userPosition}
        onMapClick={placingManually ? handleMapClickForManualLocation : undefined}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center gap-2 p-3">
        <div className="pointer-events-auto w-full max-w-sm">
          <Input
            placeholder="Zoek grid-code (bv. C4) of locatie..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="bg-background shadow-md dark:bg-background"
          />
          {eventDays.length > 0 && (
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
              <Button
                variant={selectedDayId === ALL_DAYS_VALUE ? "default" : "secondary"}
                size="sm"
                className="shrink-0 shadow-md"
                onClick={() => setSelectedDayId(ALL_DAYS_VALUE)}
              >
                Alle dagen
              </Button>
              {eventDays.map((d) => (
                <Button
                  key={d.id}
                  variant={selectedDayId === d.id ? "default" : "secondary"}
                  size="sm"
                  className="shrink-0 shadow-md"
                  onClick={() => setSelectedDayId(d.id)}
                >
                  {d.label || d.date}
                </Button>
              ))}
            </div>
          )}
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
                {poiMatches.map((p) => {
                  const cat = categoryById.get(p.categoryId ?? "");
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectPoi(p)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat?.color ?? "#64748b" }}
                      />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{cat?.label ?? ""}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <PoiFilterSheet
          categories={categories}
          visibleCategories={visibleCategories}
          onToggle={toggleCategory}
          pois={pois}
          areaCategories={areaCategories}
          visibleAreaCategoryIds={visibleAreaCategoryIds}
          onToggleArea={toggleAreaCategory}
          areas={areas}
        />
        <PoiSizeControl sizeMultiplier={poiSizeMultiplier} onChange={setPoiSizeMultiplier} />
        {offlineDownloadButton}
        <ThemeToggle variant="secondary" size="icon" className="pointer-events-auto shrink-0 shadow-md" />
        {isStaff && <PushSubscribeButton eventId={eventId} />}
      </div>

      {isStaff && <BroadcastListener eventId={eventId} />}

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

      {/* Offset well above bottom-0 to clear the map's own zoom/compass/geolocate controls,
          which now stack in that same corner (bottom-right) instead of top-right. */}
      <div className="pointer-events-none fixed right-3 bottom-48 z-20 flex flex-col items-end gap-2">
        {usingManualPosition && (
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto shadow-md"
            onClick={handleStopUsingManualLocation}
          >
            <LocateFixed size={14} />
            Terug naar GPS
          </Button>
        )}
        {showManualLocationButton && (
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

      {!isOnline ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-md">
            <WifiOff size={13} />
            Je bent offline — kaart draait op opgeslagen data
          </div>
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center">
          <div className="pointer-events-auto">
            <InstallPromptBanner />
          </div>
        </div>
      )}

      {/* Fixed to the real viewport (not the map container) so it stays put and fully
          visible regardless of mobile browser chrome or device size — this is the
          single most important piece of info for staff in the field, so it's sized and
          colored to be unmissable rather than a subtle footnote. */}
      {currentCell && !showGpsHint && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-primary py-2 pr-4 pl-3 shadow-lg">
            <MapPin size={18} className="shrink-0 text-primary-foreground" />
            <span className="text-sm text-primary-foreground/90">Jouw grid-locatie</span>
            <span className="rounded-full bg-primary-foreground px-3 py-1 text-lg leading-none font-bold text-primary">
              {currentCell.code}
            </span>
            {usingManualPosition && (
              <span className="text-xs text-primary-foreground/70">(handmatig)</span>
            )}
          </div>
        </div>
      )}

      {showGpsHint && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background shadow-md backdrop-blur-sm">
            {GPS_STATUS_MESSAGES[gpsStatus]}
          </div>
        </div>
      )}
    </div>
  );

  return needsNameGate ? <VisitorNameGate eventId={eventId}>{content}</VisitorNameGate> : content;
}
