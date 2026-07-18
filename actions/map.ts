"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap } from "@/db/schema";
import { requireAdminSession } from "@/lib/get-session";
import { saveMapImage } from "@/lib/storage";
import type { CornerSet } from "@/lib/geo";

export async function uploadMapImage(
  eventId: string,
  formData: FormData,
): Promise<{ imageUrl: string; imageWidth: number; imageHeight: number }> {
  await requireAdminSession();

  const file = formData.get("file");
  const imageWidth = Number(formData.get("imageWidth"));
  const imageHeight = Number(formData.get("imageHeight"));

  if (!(file instanceof File) || !imageWidth || !imageHeight) {
    throw new Error("Ongeldige afbeelding.");
  }

  const imageUrl = await saveMapImage(eventId, file);

  revalidatePath(`/admin/events/${eventId}/map`);
  return { imageUrl, imageWidth, imageHeight };
}

export async function saveMapCorners(input: {
  eventId: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet;
}) {
  await requireAdminSession();

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

  revalidatePath(`/admin/events/${input.eventId}`);
}
