"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { getLiveLocations } from "@/actions/live-location";
import {
  EventMapView,
  type EventMapArea,
  type EventMapAreaCategory,
  type EventMapLiveUser,
  type EventMapPoiCategory,
} from "@/components/event-map-view";
import { IncidentsSheet } from "@/components/incidents-sheet";
import { BroadcastDialog } from "@/components/broadcast-dialog";
import { TopSearchesSheet } from "@/components/top-searches-sheet";
import { PoiFilterSheet } from "@/components/poi-filter-sheet";
import { PoiSizeControl } from "@/components/poi-size-control";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useVisibilityFilter } from "@/hooks/use-visibility-filter";
import { useMapSearch } from "@/hooks/use-map-search";
import type { listIncidents } from "@/actions/incidents";
import type { eventMap, gridConfig, poi } from "@/db/schema";
import { isPointInPolygon, type GridCell } from "@/lib/geo";
import { isLiveLocation } from "@/lib/live-location";

const visibleCategoriesKey = (eventId: string) => `live-visible-categories-${eventId}`;
const visibleAreaCategoriesKey = (eventId: string) => `live-visible-area-categories-${eventId}`;
const visibleLiveUsersKey = (eventId: string) => `live-visible-users-${eventId}`;

type MapRow = typeof eventMap.$inferSelect;
type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;
type IncidentRow = Awaited<ReturnType<typeof listIncidents>>[number];
type TopSearch = { type: "grid" | "poi"; term: string; count: number };

const POLL_INTERVAL_MS = 8_000;

export function LiveOpsView({
  eventId,
  eventSlug,
  eventName,
  map,
  tileUrlTemplate,
  grid,
  gridCells,
  pois,
  categories,
  areas,
  areaCategories,
  canViewLive,
  canManageIncidents,
  initialLiveUsers,
  initialIncidents,
  topSearches,
  recipients,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  map: MapRow | null;
  /** Resolved (S3 or local) tile URL template for `map.tileVersion` — see the same prop on
   * OperationalMap for why this is computed server-side instead of derived here. */
  tileUrlTemplate: string | null;
  /** Raw grid config row — used only to parse grid-code search queries (see useMapSearch);
   * `gridCells` below is the already-computed cell list used for rendering/highlighting. */
  grid: GridRow | null;
  gridCells: GridCell[];
  pois: PoiRow[];
  categories: EventMapPoiCategory[];
  areas: EventMapArea[];
  areaCategories: EventMapAreaCategory[];
  canViewLive: boolean;
  canManageIncidents: boolean;
  initialLiveUsers: EventMapLiveUser[];
  initialIncidents: IncidentRow[];
  topSearches: TopSearch[];
  recipients: { id: string; name: string }[];
}) {
  const t = useTranslations("liveOpsView");
  const tPublicMap = useTranslations("publicMap");
  const [rawLiveUsers, setRawLiveUsers] = useState<EventMapLiveUser[]>(initialLiveUsers);
  const [poiSizeMultiplier, setPoiSizeMultiplier] = useState(1);

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

  const gridLabelOptions = useMemo(
    () =>
      grid
        ? {
            prefix: grid.labelPrefix,
            letterStart: grid.labelLetterStart,
            numberStart: grid.labelNumberStart,
            letterGroupSize: grid.labelLetterGroupSize,
            order: grid.labelOrder,
          }
        : undefined,
    [grid],
  );

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
    isStaff: true,
    grid,
    gridCells,
    gridLabelOptions,
    visiblePois: pois,
    visibleCategories,
    userPosition: null,
  });
  const showResults = query.trim().length > 0 && (gridMatch || poiMatches.length > 0);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    if (!canViewLive) return;
    const id = setInterval(async () => {
      try {
        const rows = await getLiveLocations(eventId);
        setRawLiveUsers(
          rows.map((r) => ({ userId: r.userId, userName: r.userName, lat: r.lat, lng: r.lng, updatedAt: r.updatedAt })),
        );
      } catch {
        // Best-effort polling — a transient failure just skips this refresh.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [eventId, canViewLive]);

  const liveUsers = useMemo(
    () =>
      rawLiveUsers.map((u) => {
        const area = areas.find((a) => isPointInPolygon({ lat: u.lat, lng: u.lng }, a.vertices));
        return { ...u, areaLabel: area?.name ?? null };
      }),
    [rawLiveUsers, areas],
  );

  // A per-viewer preference (this browser only, see useVisibilityFilter), separate from the
  // POI/area category filters above — someone hidden here stays hidden across their own
  // live/last-known transitions, since `liveUsers` never drops a person once seen (see
  // getLiveLocations).
  const liveUserIds = useMemo(() => liveUsers.map((u) => u.userId), [liveUsers]);
  const { visibleIds: visibleLiveUserIds, toggle: toggleLiveUser } = useVisibilityFilter(
    visibleLiveUsersKey(eventId),
    liveUserIds,
  );
  const shownLiveUsers = useMemo(
    () => liveUsers.filter((u) => visibleLiveUserIds.includes(u.userId)),
    [liveUsers, visibleLiveUserIds],
  );
  const activeLiveUserCount = shownLiveUsers.filter((u) => isLiveLocation(u.updatedAt)).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/org/events/${eventSlug}`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <ArrowLeft />
            <span className="sr-only">{t("backToEvent")}</span>
          </Link>
          <span className="truncate font-semibold">{eventName}</span>
          {canViewLive && (
            <Badge variant="secondary" className="shrink-0">
              {t("activeCount", { count: activeLiveUserCount })}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PoiFilterSheet
            categories={categories}
            visibleCategories={visibleCategories}
            onToggle={toggleCategory}
            pois={pois}
            areaCategories={areaCategories}
            visibleAreaCategoryIds={visibleAreaCategoryIds}
            onToggleArea={toggleAreaCategory}
            areas={areas}
            liveUsers={canViewLive ? liveUsers.map((u) => ({ id: u.userId, label: u.userName })) : undefined}
            visibleLiveUserIds={visibleLiveUserIds}
            onToggleLiveUser={toggleLiveUser}
          />
          <PoiSizeControl sizeMultiplier={poiSizeMultiplier} onChange={setPoiSizeMultiplier} />
          <TopSearchesSheet topSearches={topSearches} />
          {canManageIncidents && (
            <>
              <IncidentsSheet eventId={eventId} eventSlug={eventSlug} initialIncidents={initialIncidents} />
              <BroadcastDialog eventId={eventId} eventSlug={eventSlug} recipients={recipients} />
            </>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {map ? (
          <EventMapView
            className="absolute inset-0"
            mapImage={{
              imageUrl: map.imageUrl,
              displayImageUrl: map.displayImageUrl,
              corners: {
                tl: { lat: map.cornerTlLat, lng: map.cornerTlLng },
                tr: { lat: map.cornerTrLat, lng: map.cornerTrLng },
                br: { lat: map.cornerBrLat, lng: map.cornerBrLng },
                bl: { lat: map.cornerBlLat, lng: map.cornerBlLng },
              },
              lockOrientation: map.lockOrientation,
              bearing: map.bearing,
              tiles:
                tileUrlTemplate && map.tileMinZoom != null && map.tileMaxZoom != null
                  ? {
                      urlTemplate: tileUrlTemplate,
                      minZoom: map.tileMinZoom,
                      maxZoom: map.tileMaxZoom,
                      tileSize: map.tileSize ?? 512,
                    }
                  : null,
            }}
            gridCells={gridCells}
            highlightedCell={highlightedCell}
            pois={pois}
            categories={categories}
            visibleCategories={visibleCategories}
            extraVisiblePoiId={tempRevealedPoiId}
            areas={areas}
            areaCategories={areaCategories}
            visibleAreaCategoryIds={visibleAreaCategoryIds}
            liveUsers={canViewLive ? shownLiveUsers : []}
            onHideLiveUser={toggleLiveUser}
            poiSizeMultiplier={poiSizeMultiplier}
            flyToTarget={flyToTarget}
            externalSelectPoi={selectPoiSignal}
            onSelectedPoiIdChange={handleSelectedPoiIdChange}
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {tPublicMap("noMapConfigured")}
          </div>
        )}
        {map && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto w-full max-w-sm">
              {showResults && (
                <Card className="mb-1 max-h-64 overflow-y-auto py-2">
                  <CardContent className="space-y-1 px-2">
                    {gridMatch && (
                      <button
                        onClick={selectGridCell}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span>{tPublicMap("gridCell")}</span>
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
              <Input
                placeholder={tPublicMap("searchPlaceholder")}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="h-12 bg-background text-base shadow-md dark:bg-background"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
