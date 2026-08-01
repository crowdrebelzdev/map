import { asc, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { areaCategory, eventMap, gridConfig, mapArea, poi, poiCategory, searchLog } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission } from "@/lib/event-access";
import { getLiveLocations } from "@/actions/live-location";
import { listIncidents } from "@/actions/incidents";
import { listEventRecipients } from "@/actions/broadcasts";
import { computeGridCellsFromQuad } from "@/lib/geo";
import { mapTileUrlTemplate } from "@/lib/storage";
import { LiveOpsView } from "@/components/live-ops-view";

export default async function EventLivePage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  const canViewLive = hasEventPermission(access, "view_live_locations");
  const canManageIncidents = hasEventPermission(access, "manage_incidents");
  if (!canViewLive && !canManageIncidents) {
    redirect("/org/events");
  }

  const [map, grid, pois, categories, areas, areaCategories, liveUsers, topSearches, incidents, recipients] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
    db.query.poi.findMany({ where: eq(poi.eventId, ev.id) }),
    db.query.poiCategory.findMany({
      where: eq(poiCategory.eventId, ev.id),
      orderBy: asc(poiCategory.sortOrder),
    }),
    db.query.mapArea.findMany({ where: eq(mapArea.eventId, ev.id) }),
    db.query.areaCategory.findMany({
      where: eq(areaCategory.eventId, ev.id),
      orderBy: asc(areaCategory.sortOrder),
    }),
    canViewLive ? getLiveLocations(ev.id) : Promise.resolve([]),
    db
      .select({ type: searchLog.type, term: searchLog.term, count: count() })
      .from(searchLog)
      .where(eq(searchLog.eventId, ev.id))
      .groupBy(searchLog.type, searchLog.term)
      .orderBy(desc(count()))
      .limit(10),
    canManageIncidents ? listIncidents(ev.id) : Promise.resolve([]),
    canManageIncidents ? listEventRecipients(ev.id) : Promise.resolve([]),
  ]);

  const gridCells = grid
    ? computeGridCellsFromQuad(
        {
          tl: { lat: grid.cornerTlLat, lng: grid.cornerTlLng },
          tr: { lat: grid.cornerTrLat, lng: grid.cornerTrLng },
          br: { lat: grid.cornerBrLat, lng: grid.cornerBrLng },
          bl: { lat: grid.cornerBlLat, lng: grid.cornerBlLng },
        },
        grid.columns,
        grid.rows,
        grid.labelOrientation,
        {
          prefix: grid.labelPrefix,
          letterStart: grid.labelLetterStart,
          numberStart: grid.labelNumberStart,
          letterGroupSize: grid.labelLetterGroupSize,
        },
      )
    : [];

  return (
    <LiveOpsView
      eventId={ev.id}
      eventSlug={eventSlug}
      eventName={ev.name}
      map={map ?? null}
      tileUrlTemplate={map?.tileVersion ? mapTileUrlTemplate(ev.id, map.tileVersion) : null}
      gridCells={gridCells}
      pois={pois}
      categories={categories}
      areas={areas}
      areaCategories={areaCategories}
      canViewLive={canViewLive}
      canManageIncidents={canManageIncidents}
      initialLiveUsers={liveUsers.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        lat: r.lat,
        lng: r.lng,
      }))}
      initialIncidents={incidents}
      topSearches={topSearches}
      recipients={recipients}
    />
  );
}
