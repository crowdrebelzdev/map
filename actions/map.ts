"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, eventMapVersion } from "@/db/schema";
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
    // Snapshot the values about to be overwritten so a botched re-upload or corner-drag can
    // be undone via `restoreMapVersion` instead of redoing the placement from scratch.
    const { id: _id, ...previousValues } = existing;
    await db.insert(eventMapVersion).values(previousValues);
    await db.update(eventMap).set(values).where(eq(eventMap.eventId, input.eventId));
  } else {
    await db.insert(eventMap).values(values);
  }

  logActivity(input.eventId, session.user.id, "map.corners_update", `${session.user.name} heeft de kaartplaatsing aangepast.`);

  revalidatePath(`/admin/events/${input.eventSlug}`);
}

export async function listMapVersions(eventId: string) {
  await requireEventPermission(eventId, "edit_map");
  return db.query.eventMapVersion.findMany({
    where: eq(eventMapVersion.eventId, eventId),
    orderBy: desc(eventMapVersion.createdAt),
  });
}

export async function restoreMapVersion(eventId: string, eventSlug: string, versionId: string) {
  const { session } = await requireEventPermission(eventId, "edit_map");

  const version = await db.query.eventMapVersion.findFirst({
    where: and(eq(eventMapVersion.id, versionId), eq(eventMapVersion.eventId, eventId)),
  });
  if (!version) {
    throw new Error("Versie niet gevonden.");
  }
  const current = await db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) });

  await db.transaction(async (tx) => {
    // The version being replaced becomes restorable in turn — restoring is just another
    // "overwrite", so it gets snapshotted the same way saveMapCorners does.
    if (current) {
      const { id: _id, ...previousValues } = current;
      await tx.insert(eventMapVersion).values(previousValues);
    }
    const { id: _versionId, createdAt: _createdAt, ...restoredValues } = version;
    await tx
      .update(eventMap)
      .set({ ...restoredValues, updatedAt: new Date() })
      .where(eq(eventMap.eventId, eventId));
    await tx.delete(eventMapVersion).where(eq(eventMapVersion.id, versionId));
  });

  logActivity(eventId, session.user.id, "map.version_restore", `${session.user.name} heeft een eerdere plattegrond hersteld.`);

  revalidatePath(`/admin/events/${eventSlug}`);
  revalidatePath(`/admin/events/${eventSlug}/map`);
}
