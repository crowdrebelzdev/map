"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
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
  let key = slugifyKey(label) || "categorie";
  const existing = await db.query.poiCategory.findFirst({
    where: and(eq(poiCategory.eventId, eventId), eq(poiCategory.key, key)),
  });
  if (existing) key = `${key}-${Date.now().toString(36)}`;
  return key;
}

function validateLabelAndColor(t: Translator, label: string, color: string) {
  if (!label.trim()) throw new Error(t("nameRequired"));
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(t("invalidColor"));
}

function validateAutoNumberNext(t: Translator, value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(t("invalidStartNumberCategory"));
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
  const t = await getTranslations("actionErrors");
  validateLabelAndColor(t, input.label, input.color);
  const extraFields = validateExtraFields(t, input.extraFields ?? []);
  const autoNumberNext = validateAutoNumberNext(t, input.autoNumberNext);

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
  const t = await getTranslations("actionErrors");
  validateLabelAndColor(t, input.label, input.color);
  const extraFields = validateExtraFields(t, input.extraFields ?? []);
  const autoNumberNext = validateAutoNumberNext(t, input.autoNumberNext);

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
    const t = await getTranslations("actionErrors");
    throw new Error(t("categoryInUsePois"));
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
