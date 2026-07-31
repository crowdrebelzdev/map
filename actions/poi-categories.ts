"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  poi,
  poiCategory,
  poiExtraFieldTypeValues,
  type PoiExtraFieldDef,
} from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";

const MAX_EXTRA_FIELDS = 10;

function validateExtraFields(extraFields: PoiExtraFieldDef[]): PoiExtraFieldDef[] {
  if (extraFields.length > MAX_EXTRA_FIELDS) {
    throw new Error(`Maximaal ${MAX_EXTRA_FIELDS} extra velden per categorie.`);
  }
  const seenKeys = new Set<string>();
  return extraFields.map((field) => {
    const key = field.key.trim();
    const label = field.label.trim();
    if (!key || !label) {
      throw new Error("Elk extra veld heeft een naam en label nodig.");
    }
    if (seenKeys.has(key)) {
      throw new Error(`Extra veld "${key}" komt dubbel voor.`);
    }
    seenKeys.add(key);
    if (!poiExtraFieldTypeValues.includes(field.type)) {
      throw new Error("Ongeldig type voor extra veld.");
    }
    return { key, label, type: field.type };
  });
}

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

function validateAutoNumberNext(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Ongeldig startnummer.");
  }
  return value;
}

export async function createPoiCategory(input: {
  eventId: string;
  eventSlug: string;
  label: string;
  color: string;
  icon?: string | null;
  extraFields?: PoiExtraFieldDef[];
  autoNumberEnabled?: boolean;
  autoNumberPrefix?: string;
  autoNumberSuffix?: string;
  autoNumberNext?: number;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  validateLabelAndColor(input.label, input.color);
  const extraFields = validateExtraFields(input.extraFields ?? []);
  const autoNumberNext = validateAutoNumberNext(input.autoNumberNext);

  const key = await uniqueKeyForEvent(input.eventId, input.label);
  const existingCount = await db.query.poiCategory.findMany({
    where: eq(poiCategory.eventId, input.eventId),
  });

  await db.insert(poiCategory).values({
    eventId: input.eventId,
    key,
    label: input.label.trim(),
    color: input.color,
    icon: input.icon || null,
    extraFields,
    autoNumberEnabled: input.autoNumberEnabled ?? false,
    autoNumberPrefix: input.autoNumberPrefix?.trim() ?? "",
    autoNumberSuffix: input.autoNumberSuffix?.trim() ?? "",
    autoNumberNext,
    sortOrder: existingCount.length,
  });

  logActivity(input.eventId, session.user.id, "category.create", `${session.user.name} heeft categorie "${input.label.trim()}" toegevoegd.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function updatePoiCategory(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  label: string;
  color: string;
  icon?: string | null;
  extraFields?: PoiExtraFieldDef[];
  autoNumberEnabled?: boolean;
  autoNumberPrefix?: string;
  autoNumberSuffix?: string;
  autoNumberNext?: number;
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  validateLabelAndColor(input.label, input.color);
  const extraFields = validateExtraFields(input.extraFields ?? []);
  const autoNumberNext = validateAutoNumberNext(input.autoNumberNext);

  await db
    .update(poiCategory)
    .set({
      label: input.label.trim(),
      color: input.color,
      icon: input.icon || null,
      extraFields,
      autoNumberEnabled: input.autoNumberEnabled ?? false,
      autoNumberPrefix: input.autoNumberPrefix?.trim() ?? "",
      autoNumberSuffix: input.autoNumberSuffix?.trim() ?? "",
      autoNumberNext,
    })
    .where(and(eq(poiCategory.id, input.categoryId), eq(poiCategory.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "category.update", `${session.user.name} heeft categorie "${input.label.trim()}" bijgewerkt.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
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

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
