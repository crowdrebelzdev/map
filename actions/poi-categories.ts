"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { poi, poiCategory } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";

function slugifyKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function uniqueKeyForEvent(eventId: string, label: string) {
  let key = slugifyKey(label) || "categorie";
  const existing = await db.query.poiCategory.findFirst({
    where: and(eq(poiCategory.eventId, eventId), eq(poiCategory.key, key)),
  });
  if (existing) key = `${key}-${Date.now().toString(36)}`;
  return key;
}

function validateLabelAndColor(label: string, color: string) {
  if (!label.trim()) throw new Error("Naam is verplicht.");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Ongeldige kleur.");
}

export async function createPoiCategory(input: {
  eventId: string;
  eventSlug: string;
  label: string;
  color: string;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  validateLabelAndColor(input.label, input.color);

  const key = await uniqueKeyForEvent(input.eventId, input.label);
  const existingCount = await db.query.poiCategory.findMany({
    where: eq(poiCategory.eventId, input.eventId),
  });

  await db.insert(poiCategory).values({
    eventId: input.eventId,
    key,
    label: input.label.trim(),
    color: input.color,
    sortOrder: existingCount.length,
  });

  logActivity(input.eventId, session.user.id, "category.create", `${session.user.name} heeft categorie "${input.label.trim()}" toegevoegd.`);

  revalidatePath(`/admin/events/${input.eventSlug}/categories`);
  revalidatePath(`/admin/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function updatePoiCategory(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  label: string;
  color: string;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  validateLabelAndColor(input.label, input.color);

  await db
    .update(poiCategory)
    .set({ label: input.label.trim(), color: input.color })
    .where(and(eq(poiCategory.id, input.categoryId), eq(poiCategory.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "category.update", `${session.user.name} heeft categorie "${input.label.trim()}" bijgewerkt.`);

  revalidatePath(`/admin/events/${input.eventSlug}/categories`);
  revalidatePath(`/admin/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deletePoiCategory(eventId: string, eventSlug: string, categoryId: string) {
  const { session } = await requireEventPermission(eventId, "manage_categories");

  const inUse = await db.query.poi.findFirst({ where: eq(poi.categoryId, categoryId) });
  if (inUse) {
    throw new Error(
      "Deze categorie is nog in gebruik door POI's. Wijs de POI's eerst een andere categorie toe.",
    );
  }

  const existing = await db.query.poiCategory.findFirst({
    where: and(eq(poiCategory.id, categoryId), eq(poiCategory.eventId, eventId)),
    columns: { label: true },
  });

  await db.delete(poiCategory).where(and(eq(poiCategory.id, categoryId), eq(poiCategory.eventId, eventId)));

  if (existing) {
    logActivity(eventId, session.user.id, "category.delete", `${session.user.name} heeft categorie "${existing.label}" verwijderd.`);
  }

  revalidatePath(`/admin/events/${eventSlug}/categories`);
  revalidatePath(`/admin/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
