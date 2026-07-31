"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { eventDay, eventMap, poi, poiCategory, poiSizeValues, type PoiSize, type PoiExtraFieldValue } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";
import { sanitizeExtraFieldValues } from "@/lib/extra-fields";
import { computeTransform, latLngToPixel } from "@/lib/geo";

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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = startTime?.trim() || null;
  const end = endTime?.trim() || null;
  if (!start && !end) return { startTime: null, endTime: null };
  if (!start || !end) {
    throw new Error("Vul zowel een start- als eindtijd in, of laat beide leeg.");
  }
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
    throw new Error("Ongeldige tijd (verwacht HH:MM).");
  }
  if (start >= end) {
    throw new Error("Starttijd moet vóór eindtijd liggen.");
  }
  return { startTime: start, endTime: end };
}

function validateSize(size: string | undefined): PoiSize {
  if (!size) return "medium";
  if (!poiSizeValues.includes(size as PoiSize)) {
    throw new Error("Ongeldige grootte.");
  }
  return size as PoiSize;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateOptionalColor(color: string | null | undefined): string | null {
  if (!color) return null;
  if (!HEX_COLOR_RE.test(color)) {
    throw new Error("Ongeldige kleur.");
  }
  return color;
}

export async function createPoi(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  name: string;
  description?: string;
  eventDayId?: string | null;
  size?: string;
  startTime?: string | null;
  endTime?: string | null;
  icon?: string | null;
  fillColor?: string | null;
  borderColor?: string | null;
  owner?: string | null;
  extraFieldValues?: PoiExtraFieldValue[];
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
  const size = validateSize(input.size);
  const { startTime, endTime } = validateTimeWindow(input.startTime, input.endTime);
  const extraFieldValues = sanitizeExtraFieldValues(input.extraFieldValues);
  const fillColor = validateOptionalColor(input.fillColor);
  const borderColor = validateOptionalColor(input.borderColor);

  await db.insert(poi).values({
    eventId: input.eventId,
    categoryId: input.categoryId,
    eventDayId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    icon: input.icon || null,
    fillColor,
    borderColor,
    owner: input.owner?.trim() || null,
    size,
    startTime,
    endTime,
    extraFieldValues,
    pixelX: input.pixelX,
    pixelY: input.pixelY,
    lat: input.lat,
    lng: input.lng,
  });

  // The suggested next auto-number is a hint the form pre-fills, still overridable — the
  // counter just advances on every create so the next suggestion moves on regardless.
  if (category.autoNumberEnabled) {
    await db
      .update(poiCategory)
      .set({ autoNumberNext: category.autoNumberNext + 1 })
      .where(eq(poiCategory.id, category.id));
  }

  logActivity(input.eventId, session.user.id, "poi.create", `${session.user.name} heeft POI "${input.name.trim()}" toegevoegd.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
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
  size?: string;
  startTime?: string | null;
  endTime?: string | null;
  icon?: string | null;
  fillColor?: string | null;
  borderColor?: string | null;
  owner?: string | null;
  extraFieldValues?: PoiExtraFieldValue[];
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
  const size = validateSize(input.size);
  const { startTime, endTime } = validateTimeWindow(input.startTime, input.endTime);
  const extraFieldValues = sanitizeExtraFieldValues(input.extraFieldValues);
  const fillColor = validateOptionalColor(input.fillColor);
  const borderColor = validateOptionalColor(input.borderColor);

  await db
    .update(poi)
    .set({
      categoryId: input.categoryId,
      eventDayId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon || null,
      fillColor,
      borderColor,
      owner: input.owner?.trim() || null,
      size,
      startTime,
      endTime,
      extraFieldValues,
    })
    .where(and(eq(poi.id, input.poiId), eq(poi.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "poi.update", `${session.user.name} heeft POI "${input.name.trim()}" bijgewerkt.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function movePoi(eventId: string, eventSlug: string, poiId: string, lat: number, lng: number) {
  const { session } = await requireEventPermission(eventId, "manage_pois");

  const existing = await db.query.poi.findFirst({
    where: and(eq(poi.id, poiId), eq(poi.eventId, eventId)),
    columns: { name: true },
  });
  if (!existing) {
    throw new Error("POI niet gevonden.");
  }

  await db.update(poi).set({ lat, lng }).where(and(eq(poi.id, poiId), eq(poi.eventId, eventId)));

  logActivity(eventId, session.user.id, "poi.update", `${session.user.name} heeft POI "${existing.name}" verplaatst.`);

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
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

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}

export async function bulkMovePois(
  eventId: string,
  eventSlug: string,
  poiIds: string[],
  patch: { categoryId?: string; eventDayId?: string | null },
) {
  const { session } = await requireEventPermission(eventId, "manage_pois");
  if (poiIds.length === 0) return;

  const set: Partial<typeof poi.$inferInsert> = {};
  if (patch.categoryId) {
    const category = await db.query.poiCategory.findFirst({
      where: and(eq(poiCategory.id, patch.categoryId), eq(poiCategory.eventId, eventId)),
    });
    if (!category) {
      throw new Error("Ongeldige categorie.");
    }
    set.categoryId = patch.categoryId;
  }
  if (patch.eventDayId !== undefined) {
    set.eventDayId = await resolveEventDayId(eventId, patch.eventDayId);
  }
  if (Object.keys(set).length === 0) return;

  await db
    .update(poi)
    .set(set)
    .where(and(eq(poi.eventId, eventId), inArray(poi.id, poiIds)));

  logActivity(
    eventId,
    session.user.id,
    "poi.bulk_move",
    `${session.user.name} heeft ${poiIds.length} POI('s) in bulk verplaatst.`,
  );

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}

export async function bulkDeletePois(eventId: string, eventSlug: string, poiIds: string[]) {
  const { session } = await requireEventPermission(eventId, "manage_pois");
  if (poiIds.length === 0) return;

  await db.delete(poi).where(and(eq(poi.eventId, eventId), inArray(poi.id, poiIds)));

  logActivity(
    eventId,
    session.user.id,
    "poi.bulk_delete",
    `${session.user.name} heeft ${poiIds.length} POI('s) in bulk verwijderd.`,
  );

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}

// --- CSV import -------------------------------------------------------------------------

export type PoiImportRow = {
  name: string;
  categoryLabel: string;
  description?: string;
  lat: string;
  lng: string;
  dayLabel?: string;
  icon?: string;
  fillColor?: string;
  borderColor?: string;
  owner?: string;
  size?: string;
  startTime?: string;
  endTime?: string;
  extra?: string;
};

export type PoiImportResult = {
  imported: number;
  errors: { row: number; message: string }[];
};

function parseExtraFieldsString(extra: string | undefined): PoiExtraFieldValue[] {
  if (!extra?.trim()) return [];
  return sanitizeExtraFieldValues(
    extra.split(";").map((pair) => {
      const [key, ...rest] = pair.split("=");
      const trimmedKey = key?.trim() ?? "";
      return { key: trimmedKey, label: trimmedKey, value: rest.join("=").trim() };
    }),
  );
}

/** Bulk-creates POIs from parsed CSV rows (see `lib/csv.ts`'s counterpart `downloadCsv`
 * export in `PoiList`). Rows referencing an unknown category/day are skipped and reported
 * back rather than aborting the whole import, so one typo doesn't block the rest. */
export async function importPoisCsv(
  eventId: string,
  eventSlug: string,
  rows: PoiImportRow[],
): Promise<PoiImportResult> {
  const { session } = await requireEventPermission(eventId, "manage_pois");

  const categories = await db.query.poiCategory.findMany({ where: eq(poiCategory.eventId, eventId) });
  const categoryByLabel = new Map(categories.map((c) => [c.label.trim().toLowerCase(), c]));

  const days = await db.query.eventDay.findMany({ where: eq(eventDay.eventId, eventId) });
  const dayByLabel = new Map<string, string>();
  for (const d of days) {
    if (d.label) dayByLabel.set(d.label.trim().toLowerCase(), d.id);
    dayByLabel.set(d.date.trim().toLowerCase(), d.id);
  }

  const mapRow = await db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) });
  if (!mapRow) {
    throw new Error("Upload eerst een plattegrond voordat je POI's importeert.");
  }
  const transform = computeTransform(mapRow.imageWidth, mapRow.imageHeight, {
    tl: { lat: mapRow.cornerTlLat, lng: mapRow.cornerTlLng },
    tr: { lat: mapRow.cornerTrLat, lng: mapRow.cornerTrLng },
    br: { lat: mapRow.cornerBrLat, lng: mapRow.cornerBrLng },
    bl: { lat: mapRow.cornerBlLat, lng: mapRow.cornerBlLng },
  });

  const errors: { row: number; message: string }[] = [];
  const values: (typeof poi.$inferInsert)[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // account for the header row
    try {
      const name = row.name?.trim();
      if (!name) throw new Error("Naam ontbreekt.");

      const category = categoryByLabel.get((row.categoryLabel ?? "").trim().toLowerCase());
      if (!category) throw new Error(`Categorie "${row.categoryLabel}" niet gevonden.`);

      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Ongeldige lat/lng.");

      let eventDayId: string | null = null;
      const dayLabel = row.dayLabel?.trim();
      if (dayLabel && dayLabel.toLowerCase() !== "alle dagen") {
        const found = dayByLabel.get(dayLabel.toLowerCase());
        if (!found) throw new Error(`Dag "${row.dayLabel}" niet gevonden.`);
        eventDayId = found;
      }

      const size = validateSize(row.size);
      const fillColor = validateOptionalColor(row.fillColor);
      const borderColor = validateOptionalColor(row.borderColor);
      const { startTime, endTime } = validateTimeWindow(row.startTime, row.endTime);
      const extraFieldValues = parseExtraFieldsString(row.extra);
      const { x, y } = latLngToPixel(transform, { lat, lng });

      values.push({
        eventId,
        categoryId: category.id,
        eventDayId,
        name,
        description: row.description?.trim() || null,
        icon: row.icon?.trim() || null,
        fillColor,
        borderColor,
        owner: row.owner?.trim() || null,
        size,
        startTime,
        endTime,
        extraFieldValues,
        pixelX: x,
        pixelY: y,
        lat,
        lng,
      });
    } catch (err) {
      errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Ongeldige rij." });
    }
  });

  if (values.length > 0) {
    await db.insert(poi).values(values);
    logActivity(
      eventId,
      session.user.id,
      "poi.bulk_import",
      `${session.user.name} heeft ${values.length} POI('s) geïmporteerd via CSV.`,
    );
    revalidatePath(`/org/events/${eventSlug}/pois`);
    revalidatePath(`/events/${eventSlug}/map`);
  }

  return { imported: values.length, errors };
}
