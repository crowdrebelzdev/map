import { redirect } from "next/navigation";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin } from "@/lib/org-access";
import { EventAccessSettings } from "@/components/event-access-settings";

export default async function EventSettingsPage({
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

  return <EventAccessSettings eventId={ev.id} eventSlug={eventSlug} currentMode={ev.publicAccessMode} />;
}
