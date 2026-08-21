import { redirect } from "next/navigation";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin } from "@/lib/org-access";
import { EventAccessSettings } from "@/components/event-access-settings";
import { LiveLocationSettings } from "@/components/live-location-settings";

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

  return (
    <div className="space-y-6">
      <EventAccessSettings eventId={ev.id} eventSlug={eventSlug} currentMode={ev.publicAccessMode} />
      <LiveLocationSettings eventId={ev.id} eventSlug={eventSlug} currentEnabled={ev.liveLocationEnabled} />
    </div>
  );
}
