import { ImageResponse } from "next/og";
import { getPlatformSettings } from "@/lib/platform-settings";

/** Square PWA icon (platform brand color + logo initial — same look as the NavBar avatar,
 * see nav-bar.tsx) generated on the fly so it always reflects the current /admin/settings
 * branding. Shared by every event's manifest.webmanifest and apple-touch-icon (see
 * app/events/[eventSlug]/map/manifest.webmanifest/route.ts) rather than duplicated per
 * event — there's no per-event logo in the schema, so the art is identical either way. */
export async function GET() {
  const { logoInitial, brandColor } = await getPlatformSettings();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brandColor,
          color: "#fff",
          fontSize: 280,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        {logoInitial}
      </div>
    ),
    { width: 512, height: 512 },
  );
}
