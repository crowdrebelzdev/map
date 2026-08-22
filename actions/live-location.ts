"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { event, liveLocation, user, visitorLiveLocation } from "@/db/schema";
import { requireSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess, hasEventPermission } from "@/lib/event-access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const VISITOR_NAME_MAX_LENGTH = 80;

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

  const ev = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { liveLocationEnabled: true },
  });
  if (!ev?.liveLocationEnabled) return;

  await db
    .insert(liveLocation)
    .values({ eventId, userId: session.user.id, lat, lng, accuracy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [liveLocation.eventId, liveLocation.userId],
      set: { lat, lng, accuracy, updatedAt: new Date() },
    });
}

/** Called periodically by the operational map for anonymous "naam-only" visitors on a
 * `public_named` event — no session to gate on, so instead: (a) only writes when the event
 * actually allows it (defense in depth if this is ever called directly), and (b) is
 * rate-limited per IP+event rather than per-account, since there's no account to hold
 * accountable. Silently no-ops on anything invalid rather than throwing, since the caller
 * treats this the same as the staff version: best-effort, never surfaced to the visitor. */
export async function updateVisitorLocation(
  eventId: string,
  visitorId: string,
  name: string,
  lat: number,
  lng: number,
  accuracy: number | null,
) {
  const trimmedName = name.trim().slice(0, VISITOR_NAME_MAX_LENGTH);
  if (!visitorId || !trimmedName) return;

  const ev = await db.query.event.findFirst({ where: eq(event.id, eventId) });
  if (!ev || ev.publicAccessMode !== "public_named" || !ev.liveLocationEnabled) return;

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`visitor-location:${ip}:${eventId}`, { windowMs: 60_000, max: 30 });
  if (!allowed) return;

  await db
    .insert(visitorLiveLocation)
    .values({ eventId, visitorId, name: trimmedName, lat, lng, accuracy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [visitorLiveLocation.eventId, visitorLiveLocation.visitorId],
      set: { name: trimmedName, lat, lng, accuracy, updatedAt: new Date() },
    });
}

export async function getLiveLocations(eventId: string) {
  const session = await requireSession();
  const access = await getEventAccess(eventId, { id: session.user.id, role: session.user.role ?? null });
  if (!hasEventPermission(access, "view_live_locations")) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("notAllowedForEvent"));
  }

  const ev = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { liveLocationEnabled: true },
  });
  if (!ev?.liveLocationEnabled) return [];

  // No staleness cutoff here on purpose — a position is kept and shown until the same
  // person/visitor reports a new one, so a dropped connection shows a "last known" spot
  // instead of vanishing. Whether that's rendered as live vs. last-known (and any per-viewer
  // hide) is a display concern handled client-side, see event-map-view-inner.tsx.
  const [staffRows, visitorRows] = await Promise.all([
    db
      .select({
        userId: liveLocation.userId,
        userName: user.name,
        lat: liveLocation.lat,
        lng: liveLocation.lng,
        updatedAt: liveLocation.updatedAt,
      })
      .from(liveLocation)
      .innerJoin(user, eq(user.id, liveLocation.userId))
      .where(eq(liveLocation.eventId, eventId)),
    db
      .select({
        userId: visitorLiveLocation.visitorId,
        userName: visitorLiveLocation.name,
        lat: visitorLiveLocation.lat,
        lng: visitorLiveLocation.lng,
        updatedAt: visitorLiveLocation.updatedAt,
      })
      .from(visitorLiveLocation)
      .where(eq(visitorLiveLocation.eventId, eventId)),
  ]);

  return [...staffRows, ...visitorRows];
}
