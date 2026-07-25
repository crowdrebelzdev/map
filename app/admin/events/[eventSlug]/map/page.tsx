import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventMap, gridConfig } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission } from "@/lib/event-access";
import { MapImageEditor } from "@/components/map-image-editor";

export default async function EventMapPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  if (!hasEventPermission(access, "edit_map")) {
    redirect("/admin/events");
  }

  const [existingMap, existingGrid] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, ev.id) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, ev.id) }),
  ]);

  return (
    <MapImageEditor
      eventId={ev.id}
      eventSlug={eventSlug}
      existingMap={existingMap ?? null}
      existingGrid={existingGrid ?? null}
    />
  );
}
