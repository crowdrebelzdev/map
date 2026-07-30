"use server";

import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { searchLog, type SearchLogType } from "@/db/schema";
import { requireAnyEventAccess } from "@/lib/event-access";
import { requireOrgAdminForEvent } from "@/lib/org-access";

export async function logSearch(eventId: string, type: SearchLogType, term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;

  await requireAnyEventAccess(eventId);
  await db.insert(searchLog).values({ eventId, type, term: trimmed });
}

/** Most-searched terms for an event — surfaces POIs/locations people look for but might not
 * find easily (a name mismatch, missing POI, etc.). Fire-and-forget writes in `logSearch`
 * above had no reader until now; this is purely a reporting aggregate. */
export async function getTopSearches(
  eventId: string,
  opts?: { type?: SearchLogType; days?: number; limit?: number },
) {
  await requireOrgAdminForEvent(eventId);

  const conditions = [eq(searchLog.eventId, eventId)];
  if (opts?.type) conditions.push(eq(searchLog.type, opts.type));
  if (opts?.days) {
    conditions.push(gte(searchLog.createdAt, new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000)));
  }

  return db
    .select({ term: searchLog.term, type: searchLog.type, count: count() })
    .from(searchLog)
    .where(and(...conditions))
    .groupBy(searchLog.term, searchLog.type)
    .orderBy(desc(count()))
    .limit(opts?.limit ?? 20);
}
