import { writeFile, mkdir, rm, copyFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

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
const MAX_MAP_IMAGE_BYTES = 20 * 1024 * 1024;

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

/**
 * Saves an uploaded map image and returns its public URL. Uses S3 when
 * S3_BUCKET_NAME (+ S3_UPLOAD_REGION) are configured — required for any deploy
 * target without a persistent/shared filesystem — and falls back to the local
 * filesystem for zero-setup local development.
 */
export async function saveMapImage(eventId: string, file: File): Promise<string> {
  const ext = ALLOWED_MAP_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error("Ongeldig bestandstype. Toegestaan: PNG, JPEG of WebP.");
  }
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    throw new Error("Bestand is te groot (max. 20 MB).");
  }

  const filename = `map.${ext}`;
  const key = `uploads/${eventId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (s3Client && s3Bucket) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );
    return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}`;
  }

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
