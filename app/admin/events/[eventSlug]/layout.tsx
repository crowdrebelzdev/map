import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasAnyEventAccess, hasEventPermission } from "@/lib/event-access";
import { buttonVariants } from "@/components/ui/button";
import { EventTabs } from "@/components/event-tabs";

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

  const tabs = [
    { href: `/admin/events/${eventSlug}`, label: "Overzicht" },
    hasEventPermission(access, "edit_map") && {
      href: `/admin/events/${eventSlug}/map`,
      label: "Kaart & Grid",
    },
    hasEventPermission(access, "manage_pois") && {
      href: `/admin/events/${eventSlug}/pois`,
      label: "POI's",
    },
    hasEventPermission(access, "manage_categories") && {
      href: `/admin/events/${eventSlug}/categories`,
      label: "Categorieën",
    },
    (hasEventPermission(access, "view_live_locations") || hasEventPermission(access, "manage_incidents")) && {
      href: `/admin/events/${eventSlug}/live`,
      label: "Live locaties",
    },
    access.isAdmin && { href: `/admin/events/${eventSlug}/team`, label: "Team" },
    access.isAdmin && { href: `/admin/events/${eventSlug}/activity`, label: "Activiteit" },
  ].filter((t): t is { href: string; label: string } => !!t);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/events" className="hover:text-foreground hover:underline">
          Evenementen
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{ev.name}</span>
      </div>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold">{ev.name}</h1>
        <Link
          href={`/events/${eventSlug}/map`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Live kaart bekijken ↗
        </Link>
      </div>
      <EventTabs tabs={tabs} />
      {children}
    </div>
  );
}
