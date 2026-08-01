"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, LocateFixed, X, Download, Check, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PoiFilterSheet } from "@/components/poi-filter-sheet";
import { PoiSizeControl } from "@/components/poi-size-control";
import { BroadcastListener } from "@/components/broadcast-listener";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { VisitorNameGate } from "@/components/visitor-name-gate";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { cn } from "@/lib/utils";
import {
  EventMapView,
  type EventMapArea,
  type EventMapAreaCategory,
  type EventMapPoiCategory,
} from "@/components/event-map-view";
import { useVisibilityFilter } from "@/hooks/use-visibility-filter";
import { useGpsPosition, type GpsStatus } from "@/hooks/use-gps-position";
import { useOfflineMap } from "@/hooks/use-offline-map";
import { useLiveLocationSharing } from "@/hooks/use-live-location-sharing";
import { useGridData } from "@/hooks/use-grid-data";
import { useMapSearch } from "@/hooks/use-map-search";
import type { listMyMessages } from "@/actions/broadcasts";
import type { eventMap, gridConfig, poi, eventDay, PublicAccessMode } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type EventDayRow = typeof eventDay.$inferSelect;

const ALL_DAYS_VALUE = "__all__";

const visibleCategoriesKey = (eventId: string) => `visible-categories-${eventId}`;
const visibleAreaCategoriesKey = (eventId: string) => `visible-area-categories-${eventId}`;

const GPS_STATUS_MESSAGE_KEYS: Record<Exclude<GpsStatus, "active">, string> = {
  locating: "gpsLocating",
  denied: "gpsDenied",
  unavailable: "gpsUnavailable",
  insecure: "gpsInsecure",
  unsupported: "gpsUnsupported",
};

export function OperationalMap({
  eventId,
  eventSlug,
  currentUserId,
  isStaff,
  publicAccessMode,
  map,
  tileUrlTemplate,
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
  /** Resolved (S3 or local) tile URL template for `map.tileVersion` — computed server-side in
   * the page component, since it depends on env vars (S3 bucket/region) not available to
   * client code. Null when the plattegrond has no tile set yet (see EventMapImage["tiles"]). */
  tileUrlTemplate: string | null;
  grid: GridRow | null;
  pois: PoiRow[];
  categories: EventMapPoiCategory[];
  areas: EventMapArea[];
  areaCategories: EventMapAreaCategory[];
  eventDays: EventDayRow[];
  initialMessages: Awaited<ReturnType<typeof listMyMessages>>;
}) {
  const t = useTranslations("publicMap");
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const areaCategoryIds = useMemo(() => areaCategories.map((c) => c.id), [areaCategories]);
  const { visibleIds: visibleCategories, toggle: toggleCategory } = useVisibilityFilter(
    visibleCategoriesKey(eventId),
    categoryIds,
  );
  const { visibleIds: visibleAreaCategoryIds, toggle: toggleAreaCategory } = useVisibilityFilter(
    visibleAreaCategoriesKey(eventId),
    areaCategoryIds,
  );

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

  const {
    gpsStatus,
    userPosition,
    usingManualPosition,
    placingManually,
    setPlacingManually,
    latestGpsRef,
    handleMapClickForManualLocation,
    handleStopUsingManualLocation,
  } = useGpsPosition();

  useLiveLocationSharing(eventId, isStaff, latestGpsRef);

  const { isOnline, offlineStatus, offlineProgress, handleDownloadOffline, showOfflineTip, dismissOfflineTip } =
    useOfflineMap(map, tileUrlTemplate);

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
        ? t("offlineDone")
        : offlineStatus === "downloading"
          ? t("offlineDownloading", { done: offlineProgress.done, total: offlineProgress.total || "?" })
          : offlineStatus === "error"
            ? t("offlineError")
            : t("offlineIdle");
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "pointer-events-auto relative shrink-0 shadow-md",
                offlineStatus === "done" && "text-emerald-600",
              )}
              disabled={offlineStatus === "downloading"}
            />
          }
          onClick={offlineStatus === "downloading" || offlineStatus === "done" ? undefined : handleDownloadOffline}
        >
          {icon}
          <span className="sr-only">{label}</span>
          {/* Permanent signal that the map is safe to use offline — the icon/tooltip above
              only communicate that on hover, which isn't discoverable on a touch device. */}
          {offlineStatus === "done" && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineStatus, offlineProgress.done, offlineProgress.total, t]);

  const { gridCorners, gridLabelOptions, gridCells, currentCell } = useGridData(grid, userPosition);

  const {
    query,
    handleQueryChange,
    flyToTarget,
    selectPoiSignal,
    tempRevealedPoiId,
    highlightedCell,
    gridMatch,
    poiMatches,
    handleSelectedPoiIdChange,
    selectGridCell,
    selectPoi,
  } = useMapSearch({
    eventId,
    isStaff,
    grid,
    gridCells,
    gridLabelOptions,
    visiblePois,
    visibleCategories,
    userPosition,
  });

  const needsNameGate = !isStaff && publicAccessMode === "public_named";

  if (!map) {
    const empty = <div className="p-4 text-sm text-muted-foreground">{t("noMapConfigured")}</div>;
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
          tiles:
            tileUrlTemplate && map.tileMinZoom != null && map.tileMaxZoom != null
              ? { urlTemplate: tileUrlTemplate, minZoom: map.tileMinZoom, maxZoom: map.tileMaxZoom }
              : null,
        }}
        gridCells={gridCells}
        gridTransformInput={
          grid && gridCorners ? { corners: gridCorners, columns: grid.columns, rows: grid.rows } : undefined
        }
        gridLineColor={grid?.lineColor}
        gridLineWidth={grid?.lineWidth}
        gridCasingColor={grid?.casingColor}
        gridCasingWidth={grid?.casingWidth}
        highlightedCell={highlightedCell}
        pois={visiblePois}
        categories={categories}
        visibleCategories={visibleCategories}
        extraVisiblePoiId={tempRevealedPoiId}
        areas={areas}
        areaCategories={areaCategories}
        visibleAreaCategoryIds={visibleAreaCategoryIds}
        poiSizeMultiplier={poiSizeMultiplier}
        geolocate
        flyToTarget={flyToTarget}
        externalSelectPoi={selectPoiSignal}
        onSelectedPoiIdChange={handleSelectedPoiIdChange}
        userLocation={userPosition}
        onMapClick={placingManually ? handleMapClickForManualLocation : undefined}
      />

      {/* Fixed to the real viewport (not the map container) so it stays put and fully
          visible regardless of mobile browser chrome or device size. A single top-anchored
          stack (location pill, then GPS hint / offline banner / install prompt) so each item
          sits directly under the previous one — no fixed offset that leaves a dead gap when
          the item above it isn't shown. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col items-center gap-1.5 px-16"
        style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}
      >
        {currentCell && !showGpsHint && (
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-primary py-2 pr-4 pl-3 shadow-lg">
            <MapPin size={18} className="shrink-0 text-primary-foreground" />
            <span className="text-sm text-primary-foreground/90">{t("yourGridLocation")}</span>
            <span className="rounded-full bg-primary-foreground px-3 py-1 text-lg leading-none font-bold text-primary">
              {currentCell.code}
            </span>
            {usingManualPosition && (
              <span className="text-xs text-primary-foreground/70">{t("manual")}</span>
            )}
          </div>
        )}

        {showGpsHint && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background shadow-md backdrop-blur-sm">
            {t(GPS_STATUS_MESSAGE_KEYS[gpsStatus])}
          </div>
        )}

        {!isOnline && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-md">
            <WifiOff size={13} />
            {t("offlineBanner")}
          </div>
        )}

        {isOnline && showOfflineTip && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground/90 py-1.5 pr-2 pl-3 text-xs font-medium text-background shadow-md backdrop-blur-sm">
            <Download size={13} className="shrink-0" />
            <span>{t("offlineTipMessage")}</span>
            <button
              onClick={handleDownloadOffline}
              className="shrink-0 rounded-full bg-background px-2 py-1 text-foreground"
            >
              {t("offlineTipDownload")}
            </button>
            <button
              onClick={dismissOfflineTip}
              className="shrink-0 rounded-full p-1 text-background/70 hover:text-background"
            >
              <X size={13} />
              <span className="sr-only">{t("offlineTipDismiss")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Top-right icon toolbar — its own stack, mirroring the bottom-right manual-location
          stack below, so it never has to share a row with the (centered) grid-location pill. */}
      <div
        className="pointer-events-none fixed right-3 top-0 z-10 flex flex-col-reverse gap-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-top))", top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
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
        <LocaleToggle variant="secondary" size="icon" className="pointer-events-auto shrink-0 shadow-md" />
        <ThemeToggle variant="secondary" size="icon" className="pointer-events-auto shrink-0 shadow-md" />
        {offlineDownloadButton}
        {isStaff && <PushSubscribeButton eventId={eventId} />}
      </div>

      {isStaff && <BroadcastListener eventId={eventId} />}

      {placingManually && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-16">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-md">
            {t("tapToSetLocation")}
            <button onClick={() => setPlacingManually(false)} className="opacity-80 hover:opacity-100">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom, thumb-reachable search bar — taller, and kept clear of the map's own
          bottom-right zoom/compass/geolocate stack via right padding on the row (rather
          than overlapping it), instead of the icon toolbar that used to live here. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center p-3 pr-16"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto w-full max-w-sm">
          {(usingManualPosition || showManualLocationButton) && (
            <div className="mb-1.5 flex justify-end gap-2">
              {usingManualPosition && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shadow-md"
                  onClick={handleStopUsingManualLocation}
                >
                  <LocateFixed size={14} />
                  {t("backToGps")}
                </Button>
              )}
              {showManualLocationButton && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shadow-md"
                  onClick={() => setPlacingManually((v) => !v)}
                >
                  <MapPin size={14} />
                  {t("setManualLocation")}
                </Button>
              )}
            </div>
          )}
          {showResults && (
            <Card className="mb-1 max-h-64 overflow-y-auto py-2">
              <CardContent className="space-y-1 px-2">
                {gridMatch && (
                  <button
                    onClick={selectGridCell}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span>{t("gridCell")}</span>
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
          {eventDays.length > 0 && (
            <div className="mb-1.5 flex gap-1.5 overflow-x-auto">
              <Button
                variant={selectedDayId === ALL_DAYS_VALUE ? "default" : "secondary"}
                size="sm"
                className="shrink-0 shadow-md"
                onClick={() => setSelectedDayId(ALL_DAYS_VALUE)}
              >
                {t("allDays")}
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
          <Input
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="h-12 bg-background text-base shadow-md dark:bg-background"
          />
        </div>
      </div>
    </div>
  );

  return needsNameGate ? <VisitorNameGate eventId={eventId}>{content}</VisitorNameGate> : content;
}
