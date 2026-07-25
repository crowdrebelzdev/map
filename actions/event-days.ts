"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventDay } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";

export async function createEventDay(input: {
  eventId: string;
  eventSlug: string;
  date: string;
  label?: string;
}) {
  await requireEventPermission(input.eventId, "edit_map");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Ongeldige datum.");
  }

  await db.insert(eventDay).values({
    eventId: input.eventId,
    date: input.date,
    label: input.label?.trim() || null,
  });

  revalidatePath(`/admin/events/${input.eventSlug}`);
  revalidatePath(`/admin/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deleteEventDay(eventId: string, eventSlug: string, dayId: string) {
  await requireEventPermission(eventId, "edit_map");

  await db.delete(eventDay).where(eq(eventDay.id, dayId));

  revalidatePath(`/admin/events/${eventSlug}`);
  revalidatePath(`/admin/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
