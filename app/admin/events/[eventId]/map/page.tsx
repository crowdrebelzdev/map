import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, gridConfig } from "@/db/schema";
import { MapImageEditor } from "@/components/map-image-editor";

export default async function EventMapPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [existingMap, existingGrid] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, eventId) }),
  ]);

  return (
    <MapImageEditor
      eventId={eventId}
      existingMap={existingMap ?? null}
      existingGrid={existingGrid ?? null}
    />
  );
}
