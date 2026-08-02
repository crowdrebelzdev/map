"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { eventMap, eventMapVersion } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";
import {
  saveMapImage,
  getMapImageUploadPlan,
  getMapTileUploadPlan,
  saveMapTilesLocal,
  deleteMapTiles,
  deleteMapImage,
  type MapImageUploadPlan,
  type TileUploadPlan,
} from "@/lib/storage";
import type { CornerSet } from "@/lib/geo";

/** Local-dev fallback path: still carries the file through the server action (see
 * getMapImageUploadPlan's "local" mode) — zero-setup local dev has no S3 to presign against
 * and no payload ceiling to route around. Production uses prepareMapImageUpload +
 * confirmMapImageUpload instead (see the comment on getMapImageUploadPlan for why). */
export async function uploadMapImage(
  eventId: string,
  eventSlug: string,
  formData: FormData,
): Promise<{ imageUrl: string; displayImageUrl: string; imageWidth: number; imageHeight: number }> {
  const { session } = await requireEventPermission(eventId, "edit_map");

  const file = formData.get("file");
  // Same resized-down copy map-image-editor.tsx generates for S3 uploads — see
  // eventMap.displayImageUrl's schema comment for why a second, smaller image is needed.
  // Falls back to `file` itself when absent (kept optional so this action still works if a
  // caller genuinely has nothing smaller to send) rather than failing the whole upload.
  const displayFile = formData.get("displayFile");
  const imageWidth = Number(formData.get("imageWidth"));
  const imageHeight = Number(formData.get("imageHeight"));

  if (!(file instanceof File) || !imageWidth || !imageHeight) {
    throw new Error("Ongeldige afbeelding.");
  }

  const imageUrl = await saveMapImage(eventId, file, "full");
  const displayImageUrl =
    displayFile instanceof File ? await saveMapImage(eventId, displayFile, "display") : imageUrl;

  logActivity(eventId, session.user.id, "map.upload", `${session.user.name} heeft een nieuwe plattegrond geüpload.`);

  revalidatePath(`/org/events/${eventSlug}/map`);
  return { imageUrl, displayImageUrl, imageWidth, imageHeight };
}

/** Hands the client either a presigned S3 PUT URL or a "local" signal for the plattegrond
 * image it's about to upload — see getMapImageUploadPlan for which, and why this exists
 * instead of always routing the file through uploadMapImage above. */
export async function prepareMapImageUpload(
  eventId: string,
  contentType: string,
  variant: "full" | "display" = "full",
): Promise<MapImageUploadPlan> {
  await requireEventPermission(eventId, "edit_map");
  return getMapImageUploadPlan(eventId, contentType, variant);
}

/** Records a plattegrond image the client already PUT directly to S3 (via
 * prepareMapImageUpload's presigned URL) — the same bookkeeping uploadMapImage does after
 * saveMapImage, just without carrying the file bytes through this action too. */
export async function confirmMapImageUpload(
  eventId: string,
  eventSlug: string,
  input: { imageUrl: string; displayImageUrl: string; imageWidth: number; imageHeight: number },
): Promise<{ imageUrl: string; displayImageUrl: string; imageWidth: number; imageHeight: number }> {
  const { session } = await requireEventPermission(eventId, "edit_map");

  logActivity(eventId, session.user.id, "map.upload", `${session.user.name} heeft een nieuwe plattegrond geüpload.`);

  revalidatePath(`/org/events/${eventSlug}/map`);
  return input;
}

export async function saveMapCorners(input: {
  eventId: string;
  eventSlug: string;
  imageUrl: string;
  displayImageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet;
}) {
  const { session } = await requireEventPermission(input.eventId, "edit_map");

  const { corners } = input;

  const values = {
    eventId: input.eventId,
    imageUrl: input.imageUrl,
    displayImageUrl: input.displayImageUrl,
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

  revalidatePath(`/org/events/${input.eventSlug}`);
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

  revalidatePath(`/org/events/${eventSlug}`);
  revalidatePath(`/org/events/${eventSlug}/map`);
}

/**
 * Permanently deletes one snapshotted version — freeing up its storage (a tile set can be
 * thousands of files) for admins who'd rather not keep every past re-upload forever. Unlike
 * `deleteMapImage`/`deleteMapTiles` elsewhere in this file, this can't assume the version's
 * image/tiles are exclusively its own: `saveMapCorners` reuses the same `imageUrl` (and thus
 * the same tile set) across multiple snapshots whenever only the *placement* changed, not the
 * image itself — so before touching storage, this checks whether the current live map or any
 * *other* remaining version still points at the same image/display image/tile set, and only
 * deletes what nothing else references. Getting this wrong would silently break the live map
 * or another, still-wanted version.
 */
export async function deleteMapVersion(eventId: string, eventSlug: string, versionId: string) {
  const { session } = await requireEventPermission(eventId, "edit_map");

  const version = await db.query.eventMapVersion.findFirst({
    where: and(eq(eventMapVersion.id, versionId), eq(eventMapVersion.eventId, eventId)),
  });
  if (!version) {
    throw new Error("Versie niet gevonden.");
  }

  const [current, otherVersions] = await Promise.all([
    db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) }),
    db.query.eventMapVersion.findMany({
      where: and(eq(eventMapVersion.eventId, eventId), ne(eventMapVersion.id, versionId)),
    }),
  ]);
  const others = [...(current ? [current] : []), ...otherVersions];

  if (version.tileVersion && !others.some((o) => o.tileVersion === version.tileVersion)) {
    await deleteMapTiles(eventId, version.tileVersion).catch(() => {
      // Best-effort — an orphaned tile set costs storage, not correctness.
    });
  }
  if (!others.some((o) => o.imageUrl === version.imageUrl)) {
    await deleteMapImage(eventId, version.imageUrl).catch(() => {});
  }
  if (
    version.displayImageUrl &&
    version.displayImageUrl !== version.imageUrl &&
    !others.some((o) => o.displayImageUrl === version.displayImageUrl)
  ) {
    await deleteMapImage(eventId, version.displayImageUrl).catch(() => {});
  }

  await db.delete(eventMapVersion).where(eq(eventMapVersion.id, versionId));

  logActivity(eventId, session.user.id, "map.version_delete", `${session.user.name} heeft een eerdere plattegrond-versie verwijderd.`);

  revalidatePath(`/org/events/${eventSlug}/map`);
}

// --- Plattegrond tegels ---
//
// Generated client-side (warping + tiling happens in the browser, off the main thread — see
// lib/tile-worker.ts) after an admin finalizes a corner placement via saveMapCorners above.
// These actions only hand out upload targets and record the result; the actual pixel work
// never touches the server. Deliberately separate from saveMapCorners itself: corner-dragging
// stays exactly as fast/responsive as it is today, and a tile run that fails or never
// finishes simply leaves eventMap.tileVersion pointing at whatever tiles (or none) already
// existed — the live map falls back to those, never a broken state.

/** Hands the client either presigned S3 PUT URLs or a "local" signal for a batch of tiles
 * it's about to upload — see getMapTileUploadPlan for which. */
export async function prepareMapTileUpload(
  eventId: string,
  versionId: string,
  tiles: { z: number; x: number; y: number }[],
): Promise<TileUploadPlan> {
  await requireEventPermission(eventId, "edit_map");
  return getMapTileUploadPlan(eventId, versionId, tiles);
}

/** Local-dev fallback for prepareMapTileUpload's "local" plan — receives actual tile bytes
 * instead of the client PUTting them straight to S3. Called once per (client-chosen) batch,
 * not once per tile, to keep the number of server-action round trips reasonable. */
export async function uploadMapTilesLocalBatch(eventId: string, versionId: string, formData: FormData) {
  await requireEventPermission(eventId, "edit_map");

  const tiles: { z: number; x: number; y: number; file: File }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const [z, x, y] = key.split(":").map(Number);
    if ([z, x, y].some((n) => !Number.isFinite(n))) continue;
    tiles.push({ z, x, y, file: value });
  }

  await saveMapTilesLocal(eventId, versionId, tiles);
}

/**
 * Marks a tile set as ready to use once every tile in it has finished uploading — the
 * live map only switches over once this has run, so a partially-uploaded tile set is never
 * shown to a visitor. Cleans up the previous tile set (if any), same as how a re-uploaded
 * image doesn't keep the old file around.
 */
export async function finalizeMapTiles(
  eventId: string,
  eventSlug: string,
  versionId: string,
  minZoom: number,
  maxZoom: number,
  tileSize: number,
) {
  const { session } = await requireEventPermission(eventId, "edit_map");

  const current = await db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) });
  if (!current) {
    throw new Error("Plattegrond niet gevonden.");
  }

  await db
    .update(eventMap)
    .set({ tileVersion: versionId, tileMinZoom: minZoom, tileMaxZoom: maxZoom, tileSize })
    .where(eq(eventMap.eventId, eventId));

  if (current.tileVersion && current.tileVersion !== versionId) {
    await deleteMapTiles(eventId, current.tileVersion).catch(() => {
      // Best-effort — an orphaned old tile set costs storage, not correctness.
    });
  }

  logActivity(eventId, session.user.id, "map.tiles_ready", `${session.user.name} heeft tegels gegenereerd voor de plattegrond.`);

  revalidatePath(`/org/events/${eventSlug}/map`);
  revalidatePath(`/events/${eventSlug}/map`);
}
