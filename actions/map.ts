"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";
import { saveMapImage } from "@/lib/storage";
import type { CornerSet } from "@/lib/geo";

export async function uploadMapImage(
  eventId: string,
  eventSlug: string,
  formData: FormData,
): Promise<{ imageUrl: string; imageWidth: number; imageHeight: number }> {
  const { session } = await requireEventPermission(eventId, "edit_map");

  const file = formData.get("file");
  const imageWidth = Number(formData.get("imageWidth"));
  const imageHeight = Number(formData.get("imageHeight"));

  if (!(file instanceof File) || !imageWidth || !imageHeight) {
    throw new Error("Ongeldige afbeelding.");
  }

  const imageUrl = await saveMapImage(eventId, file);

  logActivity(eventId, session.user.id, "map.upload", `${session.user.name} heeft een nieuwe plattegrond geüpload.`);

  revalidatePath(`/admin/events/${eventSlug}/map`);
  return { imageUrl, imageWidth, imageHeight };
}

export async function saveMapCorners(input: {
  eventId: string;
  eventSlug: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet;
}) {
  const { session } = await requireEventPermission(input.eventId, "edit_map");

  const { corners } = input;

  const values = {
    eventId: input.eventId,
    imageUrl: input.imageUrl,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    cornerTlLat: corners.tl.lat,
    cornerTlLng: corners.tl.lng,
    cornerTrLat: corners.tr.lat,
    cornerTrLng: corners.tr.lng,
    cornerBrLat: corners.br.lat,
    cornerBrLng: corners.br.lng,
    cornerBlLat: corners.bl.lat,
    cornerBlLng: corners.bl.lng,
    updatedAt: new Date(),
  };

  const existing = await db.query.eventMap.findFirst({
    where: eq(eventMap.eventId, input.eventId),
  });

  if (existing) {
    await db.update(eventMap).set(values).where(eq(eventMap.eventId, input.eventId));
  } else {
    await db.insert(eventMap).values(values);
  }

  logActivity(input.eventId, session.user.id, "map.corners_update", `${session.user.name} heeft de kaartplaatsing aangepast.`);

  revalidatePath(`/admin/events/${input.eventSlug}`);
}
