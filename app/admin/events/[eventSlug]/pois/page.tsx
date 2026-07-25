import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventDay, eventMap, gridConfig, poi, poiCategory } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission } from "@/lib/event-access";
import { PoiEditor } from "@/components/poi-editor";

export default async function EventPoisPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  if (!hasEventPermission(access, "manage_pois")) {
    redirect("/admin/events");
  }

  const [map, grid, pois, categories, days] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
    db.query.poi.findMany({ where: eq(poi.eventId, ev.id) }),
    db.query.poiCategory.findMany({
      where: eq(poiCategory.eventId, ev.id),
      orderBy: asc(poiCategory.sortOrder),
    }),
    db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
  ]);

  return (
    <PoiEditor
      eventId={ev.id}
      eventSlug={eventSlug}
      map={map ?? null}
      grid={grid ?? null}
      pois={pois}
      categories={categories}
      eventDays={days}
    />
  );
}
