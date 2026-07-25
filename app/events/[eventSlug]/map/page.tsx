import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventDay, eventMap, gridConfig, poi, poiCategory } from "@/db/schema";
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
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  if (!hasAnyEventAccess(access)) {
    redirect("/events");
  }

  const [map, grid, pois, categories, days, messages] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
    db.query.poi.findMany({ where: eq(poi.eventId, ev.id) }),
    db.query.poiCategory.findMany({
      where: eq(poiCategory.eventId, ev.id),
      orderBy: asc(poiCategory.sortOrder),
    }),
    db.query.eventDay.findMany({ where: eq(eventDay.eventId, ev.id), orderBy: asc(eventDay.date) }),
    listMyMessages(ev.id),
  ]);

  return (
    <OperationalMap
      eventId={ev.id}
      eventSlug={eventSlug}
      currentUserId={session!.user.id}
      map={map ?? null}
      grid={grid ?? null}
      pois={pois}
      categories={categories}
      eventDays={days}
      initialMessages={messages}
    />
  );
}
