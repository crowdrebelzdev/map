import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/get-event";
import { getPlatformSettings } from "@/lib/platform-settings";

/** A plain Route Handler, not Next's special `manifest.ts` file convention — that convention
 * is documented to only work at the app root and gets no access to route params, which is
 * exactly what's needed here: a per-event manifest whose `start_url` points back at that
 * event's map. Without this, the app-wide `/manifest.json`'s fixed `start_url: "/"` would send
 * an anonymous visitor who installs the map as an app to the sign-in screen instead — `/`
 * requires a session. */
export async function GET(_request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const [event, { platformName, brandColor }] = await Promise.all([
    getEventBySlug(eventSlug),
    getPlatformSettings(),
  ]);

  const manifest = {
    id: `/events/${eventSlug}/map`,
    name: event ? `${event.name} — ${platformName}` : platformName,
    short_name: event?.name ?? platformName,
    description: "Live kaart voor dit evenement.",
    start_url: `/events/${eventSlug}/map`,
    scope: `/events/${eventSlug}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: brandColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
