import webpush from "web-push";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscription } from "@/db/schema";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

/** False in any environment where the VAPID env vars haven't been set — callers treat
 * push as a best-effort extra, never a hard requirement to send a broadcast. */
export const pushConfigured = Boolean(publicKey && privateKey && subject);

if (pushConfigured) {
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}

/** Fire-and-forget push delivery for a just-sent broadcast — called from
 * `actions/broadcasts.ts` after the broadcast row is already committed, so a push failure
 * never blocks or fails the broadcast itself. Subscriptions the push service reports as
 * gone (410/404 — browser uninstalled, permission revoked, etc.) are cleaned up as they're
 * found rather than left to accumulate. */
export async function sendBroadcastPush(
  eventId: string,
  recipientId: string | null,
  payload: { title: string; body: string },
): Promise<void> {
  if (!pushConfigured) return;

  try {
    const subs = await db.query.pushSubscription.findMany({
      where: recipientId
        ? and(eq(pushSubscription.eventId, eventId), eq(pushSubscription.userId, recipientId))
        : eq(pushSubscription.eventId, eventId),
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
          }
        }
      }),
    );
  } catch {
    // Best-effort: push delivery issues shouldn't surface as a broadcast-sending error.
  }
}
