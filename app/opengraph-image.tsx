import { ImageResponse } from "next/og";
import { getPlatformSettings } from "@/lib/platform-settings";
import { brandIconElement } from "@/lib/brand-icon";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social-share preview image (og:image, and reused by Next for twitter:image since
 * generateMetadata sets twitter.card) — shown when a link into this platform is shared in
 * WhatsApp/Slack/mail. Built from the same /admin/settings branding as the favicon and PWA
 * icon rather than a separate upload. */
export default async function OpengraphImage() {
  const settings = await getPlatformSettings();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          background: "#fff",
        }}
      >
        <div style={{ width: 220, height: 220, borderRadius: 32, overflow: "hidden", display: "flex" }}>
          {await brandIconElement(settings, 110)}
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            fontFamily: "sans-serif",
            color: "#111827",
          }}
        >
          {settings.platformName}
        </div>
      </div>
    ),
    size,
  );
}
