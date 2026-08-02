"use server";

import { and, eq, gt } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { liveLocation, user } from "@/db/schema";
import { requireSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess, hasEventPermission } from "@/lib/event-access";

const STALE_MS = 3 * 60 * 1000;

/** Called periodically by the operational map while it's open. Any authenticated user
 * with access to the event may report their own position — this is what powers the
 * live "who's where" dashboard, not something that needs its own permission to write. */
export async function updateLiveLocation(
  eventId: string,
  lat: number,
  lng: number,
  accuracy: number | null,
) {
  const session = await requireSession();
  const access = await getEventAccess(eventId, { id: session.user.id, role: session.user.role ?? null });
  if (!hasAnyEventAccess(access)) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("noEventAccess"));
  }

  await db
    .insert(liveLocation)
    .values({ eventId, userId: session.user.id, lat, lng, accuracy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [liveLocation.eventId, liveLocation.userId],
      set: { lat, lng, accuracy, updatedAt: new Date() },
    });
}

export async function getLiveLocations(eventId: string) {
  const session = await requireSession();
  const access = await getEventAccess(eventId, { id: session.user.id, role: session.user.role ?? null });
  if (!hasEventPermission(access, "view_live_locations")) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("notAllowedForEvent"));
  }

  return db
    .select({
      userId: liveLocation.userId,
      userName: user.name,
      lat: liveLocation.lat,
      lng: liveLocation.lng,
      updatedAt: liveLocation.updatedAt,
    })
    .from(liveLocation)
    .innerJoin(user, eq(user.id, liveLocation.userId))
    .where(and(eq(liveLocation.eventId, eventId), gt(liveLocation.updatedAt, new Date(Date.now() - STALE_MS))));
}
