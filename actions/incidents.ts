"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
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
    throw new Error("Beschrijving is verplicht.");
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

  revalidatePath(`/admin/events/${input.eventSlug}/live`);
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

export async function resolveIncident(eventId: string, eventSlug: string, incidentId: string) {
  const { session } = await requireEventPermission(eventId, "manage_incidents");

  await db
    .update(incident)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: session.user.id })
    .where(and(eq(incident.id, incidentId), eq(incident.eventId, eventId)));

  revalidatePath(`/admin/events/${eventSlug}/live`);
}
