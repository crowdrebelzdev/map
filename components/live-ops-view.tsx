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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { listIncidents } from "@/actions/incidents";
import type { eventMap, gridConfig, poi } from "@/db/schema";
import { isPointInPolygon, type GridCell } from "@/lib/geo";

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

  useEffect(() => {
    if (!canViewLive) return;
    const id = setInterval(async () => {
      try {
        const rows = await getLiveLocations(eventId);
        setRawLiveUsers(rows.map((r) => ({ userId: r.userId, userName: r.userName, lat: r.lat, lng: r.lng })));
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
              {t("activeCount", { count: liveUsers.length })}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
            pois={pois}
            categories={categories}
            areas={areas}
            areaCategories={areaCategories}
            liveUsers={canViewLive ? liveUsers : []}
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {tPublicMap("noMapConfigured")}
          </div>
        )}
      </div>
    </div>
  );
}
