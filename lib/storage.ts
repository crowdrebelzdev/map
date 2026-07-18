import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

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
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const filename = `map.${ext}`;
  const key = `uploads/${eventId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (s3Client && s3Bucket) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      }),
    );
    return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}`;
  }

  const dir = path.join(UPLOADS_DIR, eventId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${eventId}/${filename}`;
}
