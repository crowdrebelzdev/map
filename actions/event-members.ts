"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventMember, user, type EventMemberPermission } from "@/db/schema";
import { requireOrgAdminForEvent } from "@/lib/org-access";
import { logActivity } from "@/lib/activity-log";

export async function setEventMemberPermissions(
  eventId: string,
  eventSlug: string,
  userId: string,
  permissions: EventMemberPermission[],
) {
  const session = await requireOrgAdminForEvent(eventId);

  await db
    .insert(eventMember)
    .values({ eventId, userId, permissions })
    .onConflictDoUpdate({
      target: [eventMember.eventId, eventMember.userId],
      set: { permissions },
    });

  const target = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true } });
  logActivity(
    eventId,
    session.user.id,
    "team.permissions_update",
    `${session.user.name} heeft de rechten van ${target?.name ?? "een teamlid"} aangepast.`,
  );

  revalidatePath(`/org/events/${eventSlug}/team`);
  revalidatePath("/org/events");
  revalidatePath("/events");
}

export async function removeEventMember(eventId: string, eventSlug: string, userId: string) {
  const session = await requireOrgAdminForEvent(eventId);

  const target = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true } });

  await db
    .delete(eventMember)
    .where(and(eq(eventMember.eventId, eventId), eq(eventMember.userId, userId)));

  logActivity(
    eventId,
    session.user.id,
    "team.member_removed",
    `${session.user.name} heeft ${target?.name ?? "een teamlid"} uit het team verwijderd.`,
  );

  revalidatePath(`/org/events/${eventSlug}/team`);
  revalidatePath("/org/events");
  revalidatePath("/events");
}
