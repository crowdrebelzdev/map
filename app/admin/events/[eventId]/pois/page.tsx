import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, gridConfig, poi } from "@/db/schema";
import { PoiEditor } from "@/components/poi-editor";

export default async function EventPoisPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [map, grid, pois] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) }),
    db.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, eventId) }),
    db.query.poi.findMany({ where: eq(poi.eventId, eventId) }),
  ]);

  return (
    <PoiEditor eventId={eventId} map={map ?? null} grid={grid ?? null} pois={pois} />
  );
}
