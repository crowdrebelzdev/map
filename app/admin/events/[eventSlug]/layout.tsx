import { redirect } from "next/navigation";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess, buildEventTabs } from "@/lib/event-access";
import { EventChrome } from "@/components/event-chrome";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  if (!hasAnyEventAccess(access)) {
    redirect("/admin/events");
  }

  const tabs = buildEventTabs(eventSlug, access);

  return (
    <EventChrome eventSlug={eventSlug} eventName={ev.name} tabs={tabs}>
      {children}
    </EventChrome>
  );
}
