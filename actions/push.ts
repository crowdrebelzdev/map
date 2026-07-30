"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscription } from "@/db/schema";
import { requireAnyEventAccess } from "@/lib/event-access";

export async function subscribeToPush(
  eventId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  const { session } = await requireAnyEventAccess(eventId);

  await db
    .insert(pushSubscription)
    .values({
      eventId,
      userId: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        eventId,
        userId: session.user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
}

export async function unsubscribeFromPush(eventId: string, endpoint: string) {
  await requireAnyEventAccess(eventId);
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.eventId, eventId), eq(pushSubscription.endpoint, endpoint)));
}
