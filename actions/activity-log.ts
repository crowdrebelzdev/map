"use server";

import { and, desc, eq, ilike, like } from "drizzle-orm";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { requireOrgAdminForEvent } from "@/lib/org-access";

const DEFAULT_PAGE_SIZE = 30;

export async function listActivity(
  eventId: string,
  opts?: { actionPrefix?: string; search?: string; limit?: number; offset?: number },
) {
  await requireOrgAdminForEvent(eventId);

  const conditions = [eq(activityLog.eventId, eventId)];
  if (opts?.actionPrefix) {
    conditions.push(like(activityLog.action, `${opts.actionPrefix}%`));
  }
  if (opts?.search?.trim()) {
    conditions.push(ilike(activityLog.summary, `%${opts.search.trim()}%`));
  }

  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      summary: activityLog.summary,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(and(...conditions))
    .orderBy(desc(activityLog.createdAt))
    .limit(opts?.limit ?? DEFAULT_PAGE_SIZE)
    .offset(opts?.offset ?? 0);
}
