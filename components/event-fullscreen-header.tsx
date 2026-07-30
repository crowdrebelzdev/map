"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EventTabs } from "@/components/event-tabs";

/** Slim header row for the fullscreen map/POI pages — the same pattern as live-ops-view's
 * own header, so it's the top edge of the fullscreen shell itself rather than a separate
 * floating layer above the map. Doubles as the only way back to Overzicht/Team/Activiteit
 * while a fullscreen page is open, since EventChrome hides the normal tabs on these routes. */
export function EventFullscreenHeader({
  eventSlug,
  eventName,
  tabs,
}: {
  eventSlug: string;
  eventName: string;
  tabs: { href: string; label: string }[];
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b bg-background px-3 py-2">
      <Link
        href={`/admin/events/${eventSlug}`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <ArrowLeft />
        <span className="sr-only">Terug naar evenement</span>
      </Link>
      <span className="shrink-0 truncate text-sm font-semibold">{eventName}</span>
      <EventTabs tabs={tabs} />
    </div>
  );
}
