"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EventTabs } from "@/components/event-tabs";

/** Wraps the breadcrumb/title/tabs chrome above every event admin page — except the
 * fullscreen map/POI pages, which render their own slim header inside their own shell
 * instead. Rendering nothing here on those routes is what fixes the leftover scroll
 * (the hidden-but-still-in-flow chrome no longer adds height) and the unreachable tabs. */
export function EventChrome({
  eventSlug,
  eventName,
  tabs,
  children,
}: {
  eventSlug: string;
  eventName: string;
  tabs: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullscreen = pathname.endsWith("/map") || pathname.endsWith("/pois");

  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/org/events" className="hover:text-foreground hover:underline">
          Evenementen
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{eventName}</span>
      </div>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold">{eventName}</h1>
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
