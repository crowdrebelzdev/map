"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { incident, type IncidentType } from "@/db/schema";
import { user } from "@/db/schema";
import { requireAnyEventAccess, requireEventPermission } from "@/lib/event-access";

/** Any event member can report an incident or send an SOS — same baseline as sharing a
 * live location, not a backoffice permission. SOS needs no description: a single tap with
 * the current location is the whole point. */
export async function createIncident(input: {
  eventId: string;
  eventSlug: string;
  type: IncidentType;
  category?: string;
  description?: string;
  lat: number;
  lng: number;
}) {
  const { session } = await requireAnyEventAccess(input.eventId);

  if (input.type === "incident" && !input.description?.trim()) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("descriptionRequired"));
  }

  await db.insert(incident).values({
    eventId: input.eventId,
    reporterId: session.user.id,
    type: input.type,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    lat: input.lat,
    lng: input.lng,
  });

  revalidatePath(`/org/events/${input.eventSlug}/live`);
}

export async function listIncidents(eventId: string) {
  await requireEventPermission(eventId, "manage_incidents");

  return db
    .select({
      id: incident.id,
      type: incident.type,
      category: incident.category,
      description: incident.description,
      lat: incident.lat,
      lng: incident.lng,
      status: incident.status,
      createdAt: incident.createdAt,
      reporterName: user.name,
    })
    .from(incident)
    .innerJoin(user, eq(user.id, incident.reporterId))
    .where(eq(incident.eventId, eventId))
    .orderBy(desc(incident.createdAt))
    .limit(50);
}

/** Daily incident/SOS volume for an event's dashboard — same permission as `listIncidents`. */
export async function getIncidentStats(eventId: string, days = 14) {
  await requireEventPermission(eventId, "manage_incidents");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const day = sql<string>`to_char(${incident.createdAt}, 'YYYY-MM-DD')`;

  return db
    .select({ day, count: count() })
    .from(incident)
    .where(and(eq(incident.eventId, eventId), gte(incident.createdAt, since)))
    .groupBy(day)
    .orderBy(day);
}

export async function resolveIncident(eventId: string, eventSlug: string, incidentId: string) {
  const { session } = await requireEventPermission(eventId, "manage_incidents");

  await db
    .update(incident)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: session.user.id })
    .where(and(eq(incident.id, incidentId), eq(incident.eventId, eventId)));

  revalidatePath(`/org/events/${eventSlug}/live`);
}
