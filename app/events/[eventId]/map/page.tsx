import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, gridConfig, poi } from "@/db/schema";
import { OperationalMap } from "@/components/operational-map";

export default async function StaffEventMapPage({
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

  return <OperationalMap map={map ?? null} grid={grid ?? null} pois={pois} />;
}
