"use server";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { event, searchLog, type SearchLogType } from "@/db/schema";
import { requireAnyEventAccess } from "@/lib/event-access";
import { requireOrgAdminForEvent } from "@/lib/org-access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function logSearch(eventId: string, type: SearchLogType, term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;

  await requireAnyEventAccess(eventId);
  await db.insert(searchLog).values({ eventId, type, term: trimmed });
}

/** Same as `logSearch`, but for anonymous/public map visitors — no session to gate on, so
 * instead: (a) only logs for events that actually allow public visitors (defense in depth
 * if this is ever called directly, outside the public map's own access check), and (b) is
 * rate-limited per IP+event rather than per-account. Only ever stores the search term
 * (grid code or POI name) — nothing that identifies the visitor. */
export async function logPublicSearch(eventId: string, type: SearchLogType, term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;

  const ev = await db.query.event.findFirst({ where: eq(event.id, eventId) });
  if (!ev || ev.publicAccessMode === "members_only") return;

  const ip = await getClientIp();
  const allowed = await checkRateLimit(`search:${ip}:${eventId}`, { windowMs: 60_000, max: 20 });
  if (!allowed) return;

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

/** Daily search volume for an event over the last `days` — now that public visitor searches
 * are logged too (see `logPublicSearch`), this gives organizers a sense of actual map usage,
 * not just staff activity. */
export async function getSearchActivityByDay(eventId: string, days = 14) {
  await requireOrgAdminForEvent(eventId);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const day = sql<string>`to_char(${searchLog.createdAt}, 'YYYY-MM-DD')`;

  return db
    .select({ day, count: count() })
    .from(searchLog)
    .where(and(eq(searchLog.eventId, eventId), gte(searchLog.createdAt, since)))
    .groupBy(day)
    .orderBy(day);
}
