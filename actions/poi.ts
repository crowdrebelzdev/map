"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { poi, poiCategoryValues, type PoiCategory } from "@/db/schema";
import { requireAdminSession } from "@/lib/get-session";

export async function createPoi(input: {
  eventId: string;
  category: PoiCategory;
  name: string;
  description?: string;
  pixelX: number;
  pixelY: number;
  lat: number;
  lng: number;
}) {
  await requireAdminSession();

  if (!poiCategoryValues.includes(input.category)) {
    throw new Error("Ongeldige categorie.");
  }
  if (!input.name.trim()) {
    throw new Error("Naam is verplicht.");
  }

  await db.insert(poi).values({
    eventId: input.eventId,
    category: input.category,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    pixelX: input.pixelX,
    pixelY: input.pixelY,
    lat: input.lat,
    lng: input.lng,
  });

  revalidatePath(`/admin/events/${input.eventId}/pois`);
  revalidatePath(`/events/${input.eventId}/map`);
}

export async function deletePoi(eventId: string, poiId: string) {
  await requireAdminSession();

  await db.delete(poi).where(eq(poi.id, poiId));

  revalidatePath(`/admin/events/${eventId}/pois`);
  revalidatePath(`/events/${eventId}/map`);
}
