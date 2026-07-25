"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { requireOrgAdminForEvent } from "@/lib/org-access";

export async function listActivity(eventId: string) {
  await requireOrgAdminForEvent(eventId);

  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      summary: activityLog.summary,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(eq(activityLog.eventId, eventId))
    .orderBy(desc(activityLog.createdAt))
    .limit(100);
}
