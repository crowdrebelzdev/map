"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventDay, poi, poiCategory } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";

async function resolveEventDayId(eventId: string, eventDayId: string | null | undefined) {
  if (!eventDayId) return null;
  const day = await db.query.eventDay.findFirst({
    where: and(eq(eventDay.id, eventDayId), eq(eventDay.eventId, eventId)),
  });
  if (!day) {
    throw new Error("Ongeldige dag.");
  }
  return day.id;
}

export async function createPoi(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  name: string;
  description?: string;
  eventDayId?: string | null;
  pixelX: number;
  pixelY: number;
  lat: number;
  lng: number;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_pois");

  const category = await db.query.poiCategory.findFirst({
    where: and(eq(poiCategory.id, input.categoryId), eq(poiCategory.eventId, input.eventId)),
  });
  if (!category) {
    throw new Error("Ongeldige categorie.");
  }
  if (!input.name.trim()) {
    throw new Error("Naam is verplicht.");
  }
  const eventDayId = await resolveEventDayId(input.eventId, input.eventDayId);

  await db.insert(poi).values({
    eventId: input.eventId,
    categoryId: input.categoryId,
    eventDayId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    pixelX: input.pixelX,
    pixelY: input.pixelY,
    lat: input.lat,
    lng: input.lng,
  });

  logActivity(input.eventId, session.user.id, "poi.create", `${session.user.name} heeft POI "${input.name.trim()}" toegevoegd.`);

  revalidatePath(`/admin/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function updatePoi(input: {
  eventId: string;
  eventSlug: string;
  poiId: string;
  categoryId: string;
  name: string;
  description?: string;
  eventDayId?: string | null;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_pois");

  const category = await db.query.poiCategory.findFirst({
    where: and(eq(poiCategory.id, input.categoryId), eq(poiCategory.eventId, input.eventId)),
  });
  if (!category) {
    throw new Error("Ongeldige categorie.");
  }
  if (!input.name.trim()) {
    throw new Error("Naam is verplicht.");
  }
  const eventDayId = await resolveEventDayId(input.eventId, input.eventDayId);

  await db
    .update(poi)
    .set({
      categoryId: input.categoryId,
      eventDayId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    })
    .where(and(eq(poi.id, input.poiId), eq(poi.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "poi.update", `${session.user.name} heeft POI "${input.name.trim()}" bijgewerkt.`);

  revalidatePath(`/admin/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deletePoi(eventId: string, eventSlug: string, poiId: string) {
  const { session } = await requireEventPermission(eventId, "manage_pois");

  const existing = await db.query.poi.findFirst({
    where: and(eq(poi.id, poiId), eq(poi.eventId, eventId)),
    columns: { name: true },
  });

  await db.delete(poi).where(and(eq(poi.id, poiId), eq(poi.eventId, eventId)));

  if (existing) {
    logActivity(eventId, session.user.id, "poi.delete", `${session.user.name} heeft POI "${existing.name}" verwijderd.`);
  }

  revalidatePath(`/admin/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
