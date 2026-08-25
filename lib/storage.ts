import { writeFile, mkdir, rm, copyFile } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// The client always rasterizes PDF uploads to an image before sending them here (see
// map-image-editor.tsx), so a legitimate request only ever arrives as one of these image
// types. The extension used for the stored filename is derived from this allowlist (never
// from the client-supplied `file.name`), so an uploaded file can never inject its own
// extension/path into the storage key.
const ALLOWED_MAP_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
// Kept in sync with next.config.ts's serverActions.bodySizeLimit / middlewareClientMaxBodySize
// (see the comment there) — raised from 20MB alongside map-image-editor's "Hoog"/"Maximaal"
// quality presets, which intentionally rasterize a PDF at up to 16000px to keep small printed
// text legible once tiled, and can produce a source PNG close to this size for a large/detailed
// plattegrond.
const MAX_MAP_IMAGE_BYTES = 40 * 1024 * 1024;

// None of these are named with the AWS_ prefix on purpose: AWS Amplify Hosting
// (and the Lambda runtime its SSR compute runs on) reserves that whole prefix
// and won't let app-level env vars use it. Credentials are passed explicitly
// below instead of relying on the SDK's default AWS_-env-var credential chain.
const s3Bucket = process.env.S3_BUCKET_NAME;
const s3Region = process.env.S3_UPLOAD_REGION;
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

const s3Client = s3Bucket
  ? new S3Client({
      region: s3Region,
      credentials:
        s3AccessKeyId && s3SecretAccessKey
          ? { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey }
          : undefined,
    })
  : null;

export type MapImageUploadPlan =
  | { mode: "s3"; url: string; publicUrl: string }
  | { mode: "local" };

/**
 * Prepares a direct browser-to-S3 upload for the plattegrond image itself — the same
 * presigned-URL approach getMapTileUploadPlan already uses for tiles, and for the same
 * reason: a large (up to 40MB, see MAX_MAP_IMAGE_BYTES) file routed through the Next.js
 * server action was getting silently rejected in production before it even reached the
 * Lambda — AWS's own infrastructure in front of Amplify's SSR compute (API Gateway/
 * CloudFront) has a payload ceiling well under what this app's own config allows, which
 * only surfaced once actually deployed (a generic "unexpected response from the server" on
 * the client, and no trace at all in the Lambda's own logs — the request never arrived).
 * Returns a "local" signal instead when S3 isn't configured, telling the caller to use the
 * existing `uploadMapImage` action (which still carries the file through the server) —
 * zero-setup local dev has no such payload ceiling to work around.
 */
export async function getMapImageUploadPlan(
  eventId: string,
  contentType: string,
  // Distinguishes the full-resolution upload from the display-resolution one generated
  // alongside it (see map-image-editor.tsx) — both would otherwise race for the same
  // `Date.now()`-based key when uploaded back to back.
  variant: "full" | "display" = "full",
): Promise<MapImageUploadPlan> {
  const ext = ALLOWED_MAP_IMAGE_TYPES[contentType];
  if (!ext) {
    throw new Error("Ongeldig bestandstype. Toegestaan: PNG, JPEG of WebP.");
  }

  if (!s3Client || !s3Bucket) {
    return { mode: "local" };
  }

  // Same versioned-filename scheme as saveMapImage below, so a re-upload doesn't overwrite
  // the previous file and eventMapVersion rows keep pointing at their own image.
  const suffix = variant === "display" ? "-display" : "";
  const key = `uploads/${eventId}/map-${Date.now()}${suffix}.${ext}`;
  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: s3Bucket, Key: key, ContentType: contentType }),
    { expiresIn: 15 * 60 },
  );

  return { mode: "s3", url, publicUrl: `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}` };
}

/**
 * Saves an uploaded map image and returns its public URL. Local-filesystem-only now (the S3
 * path moved to the direct-upload flow above, via getMapImageUploadPlan) — kept as the
 * zero-setup fallback for local development, where there's no S3 to presign against and no
 * payload ceiling to route around in the first place.
 */
export async function saveMapImage(
  eventId: string,
  file: File,
  variant: "full" | "display" = "full",
): Promise<string> {
  const ext = ALLOWED_MAP_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error("Ongeldig bestandstype. Toegestaan: PNG, JPEG of WebP.");
  }
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    throw new Error("Bestand is te groot (max. 40 MB).");
  }

  // Versioned filename (not a fixed `map.${ext}`) so a re-upload doesn't overwrite the
  // previous file — `eventMapVersion` rows keep pointing at their own image after this.
  // See getMapImageUploadPlan's `variant` param for why the suffix is needed.
  const suffix = variant === "display" ? "-display" : "";
  const filename = `map-${Date.now()}${suffix}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const dir = path.join(UPLOADS_DIR, eventId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${eventId}/${filename}`;
}

/**
 * Copies an event's map image to a new event's own storage path (used when duplicating an
 * event) so the two events don't end up sharing — and later fighting over — the same file.
 */
export async function copyMapImage(
  sourceEventId: string,
  targetEventId: string,
  imageUrl: string,
): Promise<string> {
  const filename = imageUrl.split("/").pop();
  if (!filename) return imageUrl;
  const targetKey = `uploads/${targetEventId}/${filename}`;

  if (s3Client && s3Bucket) {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: s3Bucket,
        CopySource: `${s3Bucket}/uploads/${sourceEventId}/${filename}`,
        Key: targetKey,
      }),
    );
    return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${targetKey}`;
  }

  const targetDir = path.join(UPLOADS_DIR, targetEventId);
  await mkdir(targetDir, { recursive: true });
  await copyFile(
    path.join(UPLOADS_DIR, sourceEventId, filename),
    path.join(targetDir, filename),
  );
  return `/uploads/${targetEventId}/${filename}`;
}

/** Best-effort cleanup of an event's uploaded map image, called when the event is deleted. */
export async function deleteMapImage(eventId: string, imageUrl: string): Promise<void> {
  const filename = imageUrl.split("/").pop();
  if (!filename) return;

  if (s3Client && s3Bucket) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: s3Bucket, Key: `uploads/${eventId}/${filename}` }),
    );
    return;
  }

  await rm(path.join(UPLOADS_DIR, eventId), { recursive: true, force: true });
}

// --- Platform-logo (Branding, /admin/settings) ---
//
// Same dual-mode approach as the plattegrond image above, at a much smaller size — a logo
// is well under any payload ceiling, but reusing the established S3-vs-local pattern (rather
// than inventing a third upload mechanism) keeps this predictable in both environments.

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoUploadPlan = { mode: "s3"; url: string; publicUrl: string } | { mode: "local" };

/** Prepares a direct browser-to-S3 upload for the platform logo — same shape as
 * getMapImageUploadPlan, scoped platform-wide instead of per-event. */
export async function getPlatformLogoUploadPlan(contentType: string): Promise<LogoUploadPlan> {
  const ext = ALLOWED_MAP_IMAGE_TYPES[contentType];
  if (!ext) {
    throw new Error("Ongeldig bestandstype. Toegestaan: PNG, JPEG of WebP.");
  }

  if (!s3Client || !s3Bucket) {
    return { mode: "local" };
  }

  const key = `uploads/platform/logo-${Date.now()}.${ext}`;
  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: s3Bucket, Key: key, ContentType: contentType }),
    { expiresIn: 15 * 60 },
  );

  return { mode: "s3", url, publicUrl: `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}` };
}

/** Local-filesystem fallback for getPlatformLogoUploadPlan's "local" mode — mirrors
 * saveMapImage. */
export async function savePlatformLogo(file: File): Promise<string> {
  const ext = ALLOWED_MAP_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error("Ongeldig bestandstype. Toegestaan: PNG, JPEG of WebP.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Bestand is te groot (max. 2 MB).");
  }

  const filename = `logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const dir = path.join(UPLOADS_DIR, "platform");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/platform/${filename}`;
}

/** Best-effort cleanup of a replaced/removed platform logo — never blocks the settings
 * update if it fails (the old file just becomes orphaned). */
export async function deletePlatformLogo(logoUrl: string): Promise<void> {
  const filename = logoUrl.split("/").pop();
  if (!filename) return;

  try {
    if (s3Client && s3Bucket) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: `uploads/platform/${filename}` }));
      return;
    }
    await rm(path.join(UPLOADS_DIR, "platform", filename), { force: true });
  } catch {
    // best-effort — see doc comment
  }
}

// --- Plattegrond tegels (raster tile pyramid) ---
//
// Same S3-vs-local dual mode as the plain map image above, but tile sets can run into the
// thousands of small files, so the upload path is different: the browser (which does the
// warping/tiling itself, off the main thread — see lib/tile-worker.ts) either uploads each
// tile directly to S3 via a short-lived presigned URL (production), or hands batches of
// tiles to `saveMapTilesLocal` to write straight to the filesystem (zero-setup local dev,
// mirroring `saveMapImage`'s existing fallback exactly).

function tileKey(eventId: string, versionId: string, z: number, x: number, y: number): string {
  return `uploads/tiles/${eventId}/${versionId}/${z}/${x}/${y}.png`;
}

/** The public URL template (with literal `{z}`/`{x}`/`{y}` placeholders) a maplibre-gl
 * raster source can fetch this event's tiles from — S3 or local, whichever backend the
 * tiles were actually written to. */
export function mapTileUrlTemplate(eventId: string, versionId: string): string {
  const relative = `uploads/tiles/${eventId}/${versionId}/{z}/{x}/{y}.png`;
  if (s3Client && s3Bucket) {
    return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${relative}`;
  }
  return `/${relative}`;
}

export type TileUploadPlan =
  | { mode: "s3"; uploads: { z: number; x: number; y: number; url: string }[] }
  | { mode: "local" };

/**
 * Prepares the client to upload a batch of tiles: presigned S3 PUT URLs when S3 storage is
 * configured, so tile bytes go straight from the browser to S3 without passing through the
 * Next.js server at all (a tile set can be thousands of small files — routing that through a
 * server action would multiply Lambda invocations for no benefit). Returns a "local" signal
 * instead when S3 isn't configured, telling the caller to use `saveMapTilesLocal`.
 */
export async function getMapTileUploadPlan(
  eventId: string,
  versionId: string,
  tiles: { z: number; x: number; y: number }[],
): Promise<TileUploadPlan> {
  if (!s3Client || !s3Bucket) {
    return { mode: "local" };
  }

  const uploads = await Promise.all(
    tiles.map(async ({ z, x, y }) => {
      const url = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: s3Bucket, Key: tileKey(eventId, versionId, z, x, y), ContentType: "image/png" }),
        { expiresIn: 15 * 60 },
      );
      return { z, x, y, url };
    }),
  );

  return { mode: "s3", uploads };
}

/** Local-filesystem fallback for `getMapTileUploadPlan`'s "local" mode. */
export async function saveMapTilesLocal(
  eventId: string,
  versionId: string,
  tiles: { z: number; x: number; y: number; file: File }[],
): Promise<void> {
  for (const { z, x, y, file } of tiles) {
    const filePath = path.join(process.cwd(), "public", tileKey(eventId, versionId, z, x, y));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  }
}

/** Deletes a version's whole tile set — called when a map is re-uploaded (the previous
 * tiles are now orphaned) or the event is deleted. Best-effort, same as `deleteMapImage`.
 * S3 listing+deletion is paged since a tile set can run into the thousands of objects. */
export async function deleteMapTiles(eventId: string, versionId: string): Promise<void> {
  if (s3Client && s3Bucket) {
    const prefix = `uploads/tiles/${eventId}/${versionId}/`;
    let continuationToken: string | undefined;
    do {
      const listed = await s3Client.send(
        new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );
      const objects = (listed.Contents ?? [])
        .map((o) => (o.Key ? { Key: o.Key } : null))
        .filter((o): o is { Key: string } => o !== null);
      if (objects.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({ Bucket: s3Bucket, Delete: { Objects: objects } }));
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    return;
  }

  await rm(path.join(process.cwd(), "public", "uploads", "tiles", eventId, versionId), {
    recursive: true,
    force: true,
  });
}
