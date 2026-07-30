import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { areaCategory, eventDay, eventMap, gridConfig, mapArea, poi, poiCategory } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess } from "@/lib/event-access";
import { listMyMessages } from "@/actions/broadcasts";
import { OperationalMap } from "@/components/operational-map";

export default async function StaffEventMapPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = session
    ? await getEventAccess(ev.id, { id: session.user.id, role: session.user.role ?? null })
    : null;
  const isStaff = access ? hasAnyEventAccess(access) : false;

  if (!isStaff) {
    if (ev.publicAccessMode === "members_only") {
      redirect(session ? "/events" : `/sign-in?redirect=/events/${eventSlug}/map`);
    }
    // public_anonymous / public_named: let the visitor through as a read-only public viewer.
  }

  const [map, grid, pois, categories, areas, areaCategories, days, messages] = await Promise.all([
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
    isStaff ? listMyMessages(ev.id) : Promise.resolve([]),
  ]);

  return (
    <OperationalMap
      eventId={ev.id}
      eventSlug={eventSlug}
      currentUserId={session?.user.id ?? null}
      isStaff={isStaff}
      publicAccessMode={ev.publicAccessMode}
      map={map ?? null}
      grid={grid ?? null}
      pois={pois}
      categories={categories}
      areas={areas}
      areaCategories={areaCategories}
      eventDays={days}
      initialMessages={messages}
    />
  );
}
