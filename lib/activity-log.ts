import { db } from "@/db";
import { activityLog } from "@/db/schema";

/** Fire-and-forget append to the per-event audit trail — called from within server actions
 * after a mutation has already succeeded. Never blocks or fails the action it's called
 * from: losing an audit-log line is preferable to failing a real POI/map/team edit. */
export function logActivity(eventId: string, userId: string, action: string, summary: string) {
  db.insert(activityLog)
    .values({ eventId, userId, action, summary })
    .catch(() => {});
}
