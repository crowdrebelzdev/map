"use server";

import { revalidatePath } from "next/cache";
import { and, asc, count, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { broadcast, eventMember, user } from "@/db/schema";
import { requireAnyEventAccess, requireEventPermission } from "@/lib/event-access";
import { sendBroadcastPush } from "@/lib/web-push";

const MAX_MESSAGE_LENGTH = 300;

/** `recipientId` targets one specific event member; omitted/null sends to everyone on
 * the operational map for this event. */
export async function sendBroadcast(
  eventId: string,
  eventSlug: string,
  message: string,
  recipientId?: string | null,
) {
  const { session } = await requireEventPermission(eventId, "manage_incidents");
  const t = await getTranslations("actionErrors");

  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error(t("messageRequired"));
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(t("maxMessageLength", { max: MAX_MESSAGE_LENGTH }));
  }

  if (recipientId) {
    const recipient = await db.query.eventMember.findFirst({
      where: and(eq(eventMember.eventId, eventId), eq(eventMember.userId, recipientId)),
    });
    if (!recipient) {
      throw new Error(t("invalidRecipient"));
    }
  }

  await db
    .insert(broadcast)
    .values({ eventId, senderId: session.user.id, recipientId: recipientId || null, message: trimmed });

  // Fire-and-forget: push delivery is a best-effort extra on top of the in-app
  // polling/toast, never something that should block or fail the broadcast itself.
  sendBroadcastPush(eventId, recipientId || null, {
    title: recipientId ? "Bericht van command center" : "Melding van command center",
    body: trimmed,
  }).catch(() => {});

  revalidatePath(`/org/events/${eventSlug}/live`);
}

/** Event members a message can be targeted at — the same pool as team assignment, since
 * only they (not org admins, who bypass eventMember entirely) are "staff on the ground". */
export async function listEventRecipients(eventId: string) {
  await requireEventPermission(eventId, "manage_incidents");

  return db
    .select({ id: user.id, name: user.name })
    .from(eventMember)
    .innerJoin(user, eq(user.id, eventMember.userId))
    .where(eq(eventMember.eventId, eventId));
}

/** Polled by the staff map for the toast notifier. `sinceIso` limits the result to
 * messages sent after the last one the client already showed, so a reload never re-shows
 * old messages as new. Only returns messages meant for this user: broadcasts (no
 * recipient) or ones addressed to them specifically. */
export async function getRecentBroadcasts(eventId: string, sinceIso?: string) {
  const { session } = await requireAnyEventAccess(eventId);

  const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 60 * 60 * 1000);

  return db
    .select({ id: broadcast.id, message: broadcast.message, createdAt: broadcast.createdAt })
    .from(broadcast)
    .where(
      and(
        eq(broadcast.eventId, eventId),
        gt(broadcast.createdAt, since),
        or(isNull(broadcast.recipientId), eq(broadcast.recipientId, session.user.id)),
      ),
    )
    .orderBy(asc(broadcast.createdAt))
    .limit(20);
}

/** Daily broadcast volume for an event's dashboard — same permission as `sendBroadcast`. */
export async function getBroadcastStats(eventId: string, days = 14) {
  await requireEventPermission(eventId, "manage_incidents");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const day = sql<string>`to_char(${broadcast.createdAt}, 'YYYY-MM-DD')`;

  return db
    .select({ day, count: count() })
    .from(broadcast)
    .where(and(eq(broadcast.eventId, eventId), gte(broadcast.createdAt, since)))
    .groupBy(day)
    .orderBy(day);
}

/** Full recent message history for the "Berichten" sheet — same visibility rule as
 * getRecentBroadcasts, but not time-windowed, so a reload doesn't lose the list. */
export async function listMyMessages(eventId: string) {
  const { session } = await requireAnyEventAccess(eventId);

  return db
    .select({
      id: broadcast.id,
      message: broadcast.message,
      createdAt: broadcast.createdAt,
      recipientId: broadcast.recipientId,
      senderName: user.name,
    })
    .from(broadcast)
    .innerJoin(user, eq(user.id, broadcast.senderId))
    .where(
      and(
        eq(broadcast.eventId, eventId),
        or(isNull(broadcast.recipientId), eq(broadcast.recipientId, session.user.id)),
      ),
    )
    .orderBy(desc(broadcast.createdAt))
    .limit(50);
}
