import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/get-event";
import { getPlatformSettings } from "@/lib/platform-settings";

/** Per-event Web App Manifest — lets a visitor "Add to Home Screen" a shortcut straight to
 * this event's map (see app/events/[eventSlug]/map/page.tsx's generateMetadata for the
 * <link rel="manifest">). Deliberately per-event rather than one root manifest for the whole
 * platform: `start_url`/`scope` pin the shortcut to this one map, and `name` uses the event's
 * own name instead of a generic app label, so a visitor with several events saved gets
 * distinct home-screen icons instead of one ambiguous "Eventkaart" icon. Only exposes the
 * event's name (already inferable from the slug in the URL) — no gating on publicAccessMode
 * needed since nothing sensitive is in here. */
export async function GET(_request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const [ev, { brandColor }] = await Promise.all([getEventBySlug(eventSlug), getPlatformSettings()]);
  if (!ev) return new NextResponse(null, { status: 404 });

  const manifest = {
    name: ev.name,
    short_name: ev.name,
    start_url: `/events/${eventSlug}/map`,
    scope: `/events/${eventSlug}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: brandColor,
    icons: [{ src: "/manifest-icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };

  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
