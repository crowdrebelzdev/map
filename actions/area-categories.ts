"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  mapArea,
  areaCategory,
  poiExtraFieldTypeValues,
  type PoiExtraFieldDef,
} from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";

const MAX_EXTRA_FIELDS = 10;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function validateExtraFields(t: Translator, extraFields: PoiExtraFieldDef[]): PoiExtraFieldDef[] {
  if (extraFields.length > MAX_EXTRA_FIELDS) {
    throw new Error(t("maxExtraFields", { max: MAX_EXTRA_FIELDS }));
  }
  const seenKeys = new Set<string>();
  return extraFields.map((field) => {
    const key = field.key.trim();
    const label = field.label.trim();
    if (!key || !label) {
      throw new Error(t("extraFieldNeedsNameAndLabel"));
    }
    if (seenKeys.has(key)) {
      throw new Error(t("duplicateExtraField", { key }));
    }
    seenKeys.add(key);
    if (!poiExtraFieldTypeValues.includes(field.type)) {
      throw new Error(t("invalidExtraFieldType"));
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
  let key = slugifyKey(label) || "area-categorie";
  const existing = await db.query.areaCategory.findFirst({
    where: and(eq(areaCategory.eventId, eventId), eq(areaCategory.key, key)),
  });
  if (existing) key = `${key}-${Date.now().toString(36)}`;
  return key;
}

function validateLabelAndColor(t: Translator, label: string, color: string) {
  if (!label.trim()) throw new Error(t("nameRequired"));
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(t("invalidColor"));
}

export async function createAreaCategory(input: {
  eventId: string;
  eventSlug: string;
  label: string;
  color: string;
  extraFields?: PoiExtraFieldDef[];
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  const t = await getTranslations("actionErrors");
  validateLabelAndColor(t, input.label, input.color);
  const extraFields = validateExtraFields(t, input.extraFields ?? []);

  const key = await uniqueKeyForEvent(input.eventId, input.label);
  const existingCount = await db.query.areaCategory.findMany({
    where: eq(areaCategory.eventId, input.eventId),
  });

  await db.insert(areaCategory).values({
    eventId: input.eventId,
    key,
    label: input.label.trim(),
    color: input.color,
    extraFields,
    sortOrder: existingCount.length,
  });

  logActivity(input.eventId, session.user.id, "category.create", `${session.user.name} heeft area-categorie "${input.label.trim()}" toegevoegd.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function updateAreaCategory(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  label: string;
  color: string;
  extraFields?: PoiExtraFieldDef[];
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_categories");
  const t = await getTranslations("actionErrors");
  validateLabelAndColor(t, input.label, input.color);
  const extraFields = validateExtraFields(t, input.extraFields ?? []);

  await db
    .update(areaCategory)
    .set({
      label: input.label.trim(),
      color: input.color,
      extraFields,
    })
    .where(and(eq(areaCategory.id, input.categoryId), eq(areaCategory.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "category.update", `${session.user.name} heeft area-categorie "${input.label.trim()}" bijgewerkt.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deleteAreaCategory(eventId: string, eventSlug: string, categoryId: string) {
  const { session } = await requireEventPermission(eventId, "manage_categories");

  const inUse = await db.query.mapArea.findFirst({ where: eq(mapArea.categoryId, categoryId) });
  if (inUse) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("categoryInUseAreas"));
  }

  const existing = await db.query.areaCategory.findFirst({
    where: and(eq(areaCategory.id, categoryId), eq(areaCategory.eventId, eventId)),
    columns: { label: true },
  });

  await db.delete(areaCategory).where(and(eq(areaCategory.id, categoryId), eq(areaCategory.eventId, eventId)));

  if (existing) {
    logActivity(eventId, session.user.id, "category.delete", `${session.user.name} heeft area-categorie "${existing.label}" verwijderd.`);
  }

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
