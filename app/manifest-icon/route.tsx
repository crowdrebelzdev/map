import { ImageResponse } from "next/og";
import { getPlatformSettings } from "@/lib/platform-settings";
import { brandIconElement } from "@/lib/brand-icon";

/** Square PWA icon — the uploaded /admin/settings logo, or the platform brand color + logo
 * initial fallback (same look as the NavBar avatar, see nav-bar.tsx) — generated on the fly
 * so it always reflects the current branding. Shared by every event's manifest.webmanifest
 * and apple-touch-icon (see app/events/[eventSlug]/map/manifest.webmanifest/route.ts) rather
 * than duplicated per event — there's no per-event logo in the schema, so the art is
 * identical either way. */
export async function GET() {
  const settings = await getPlatformSettings();

  return new ImageResponse(await brandIconElement(settings, 280), { width: 512, height: 512 });
}
