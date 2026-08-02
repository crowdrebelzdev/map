"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
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
    const t = await getTranslations("actionErrors");
    throw new Error(t("invalidDate"));
  }

  await db.insert(eventDay).values({
    eventId: input.eventId,
    date: input.date,
    label: input.label?.trim() || null,
  });

  revalidatePath(`/org/events/${input.eventSlug}`);
  revalidatePath(`/org/events/${input.eventSlug}/pois`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}

export async function deleteEventDay(eventId: string, eventSlug: string, dayId: string) {
  await requireEventPermission(eventId, "edit_map");

  await db.delete(eventDay).where(eq(eventDay.id, dayId));

  revalidatePath(`/org/events/${eventSlug}`);
  revalidatePath(`/org/events/${eventSlug}/pois`);
  revalidatePath(`/events/${eventSlug}/map`);
}
