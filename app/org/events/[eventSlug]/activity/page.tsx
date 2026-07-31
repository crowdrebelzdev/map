import { redirect } from "next/navigation";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin } from "@/lib/org-access";
import { listActivity } from "@/actions/activity-log";
import { ActivityLogView } from "@/components/activity-log-view";

export default async function EventActivityPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();

  if (!session || !(await isOrgAdmin(session, ev.organizationId))) {
    redirect("/org/events");
  }

  const entries = await listActivity(ev.id);

  return <ActivityLogView eventId={ev.id} entries={entries} />;
}
