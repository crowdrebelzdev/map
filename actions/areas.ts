"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { areaCategory, mapArea, type AreaVertex, type PoiExtraFieldValue } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";
import { sanitizeExtraFieldValues } from "@/lib/extra-fields";

const MAX_VERTICES = 60;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function sanitizeVertices(t: Translator, vertices: AreaVertex[] | undefined): AreaVertex[] {
  if (!vertices || vertices.length < 3) {
    throw new Error(t("areaMinVertices"));
  }
  if (vertices.length > MAX_VERTICES) {
    throw new Error(t("maxVertices", { max: MAX_VERTICES }));
  }
  return vertices.map((v) => {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
      throw new Error(t("invalidVertexPoint"));
    }
    return { lat: v.lat, lng: v.lng };
  });
}

export async function createArea(input: {
  eventId: string;
  eventSlug: string;
  categoryId: string;
  name: string;
  vertices: AreaVertex[];
  extraFieldValues?: PoiExtraFieldValue[];
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_pois");
  const t = await getTranslations("actionErrors");

  const category = await db.query.areaCategory.findFirst({
    where: and(eq(areaCategory.id, input.categoryId), eq(areaCategory.eventId, input.eventId)),
  });
  if (!category) {
    throw new Error(t("invalidCategory"));
  }
  if (!input.name.trim()) {
    throw new Error(t("nameRequired"));
  }
  const vertices = sanitizeVertices(t, input.vertices);
  const extraFieldValues = sanitizeExtraFieldValues(input.extraFieldValues);

  await db.insert(mapArea).values({
    eventId: input.eventId,
    categoryId: input.categoryId,
    name: input.name.trim(),
    vertices,
    extraFieldValues,
  });

  logActivity(input.eventId, session.user.id, "area.create", `${session.user.name} heeft area "${input.name.trim()}" toegevoegd.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function updateArea(input: {
  eventId: string;
  eventSlug: string;
  areaId: string;
  categoryId: string;
  name: string;
  vertices: AreaVertex[];
  extraFieldValues?: PoiExtraFieldValue[];
}) {
  const { session } = await requireEventPermission(input.eventId, "manage_pois");
  const t = await getTranslations("actionErrors");

  const category = await db.query.areaCategory.findFirst({
    where: and(eq(areaCategory.id, input.categoryId), eq(areaCategory.eventId, input.eventId)),
  });
  if (!category) {
    throw new Error(t("invalidCategory"));
  }
  if (!input.name.trim()) {
    throw new Error(t("nameRequired"));
  }
  const vertices = sanitizeVertices(t, input.vertices);
  const extraFieldValues = sanitizeExtraFieldValues(input.extraFieldValues);

  await db
    .update(mapArea)
    .set({
      categoryId: input.categoryId,
      name: input.name.trim(),
      vertices,
      extraFieldValues,
    })
    .where(and(eq(mapArea.id, input.areaId), eq(mapArea.eventId, input.eventId)));

  logActivity(input.eventId, session.user.id, "area.update", `${session.user.name} heeft area "${input.name.trim()}" bijgewerkt.`);

  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deleteArea(eventId: string, eventSlug: string, areaId: string) {
  const { session } = await requireEventPermission(eventId, "manage_pois");

  const existing = await db.query.mapArea.findFirst({
    where: and(eq(mapArea.id, areaId), eq(mapArea.eventId, eventId)),
    columns: { name: true },
  });

  await db.delete(mapArea).where(and(eq(mapArea.id, areaId), eq(mapArea.eventId, eventId)));

  if (existing) {
    logActivity(eventId, session.user.id, "area.delete", `${session.user.name} heeft area "${existing.name}" verwijderd.`);
  }

  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
