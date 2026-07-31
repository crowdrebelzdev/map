import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { areaCategory, eventDay, eventMap, gridConfig, mapArea, poi, poiCategory } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission, buildEventTabs } from "@/lib/event-access";
import { computeGridCellsFromQuad } from "@/lib/geo";
import { PoiWorkspace } from "@/components/poi-workspace";

export default async function EventPoisPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  const canManagePois = hasEventPermission(access, "manage_pois");
  const canManageCategories = hasEventPermission(access, "manage_categories");
  const canManageAreas = hasEventPermission(access, "manage_pois");
  if (!canManagePois && !canManageCategories) {
    redirect("/org/events");
  }

  const [map, grid, pois, categories, areas, areaCategories, days] = await Promise.all([
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
    db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
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
    <PoiWorkspace
      eventId={ev.id}
      eventSlug={eventSlug}
      eventName={ev.name}
      tabs={buildEventTabs(eventSlug, access)}
      map={map ?? null}
      grid={grid ?? null}
      gridCells={gridCells}
      pois={pois}
      categories={categories}
      areas={areas}
      areaCategories={areaCategories}
      eventDays={days}
      canManagePois={canManagePois}
      canManageCategories={canManageCategories}
      canManageAreas={canManageAreas}
    />
  );
}
