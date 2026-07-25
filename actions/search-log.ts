"use server";

import { db } from "@/db";
import { searchLog, type SearchLogType } from "@/db/schema";
import { requireAnyEventAccess } from "@/lib/event-access";

export async function logSearch(eventId: string, type: SearchLogType, term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;

  await requireAnyEventAccess(eventId);
  await db.insert(searchLog).values({ eventId, type, term: trimmed });
}
