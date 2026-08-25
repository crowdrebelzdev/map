import { ImageResponse } from "next/og";
import { getPlatformSettings } from "@/lib/platform-settings";
import { brandIconElement } from "@/lib/brand-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab favicon — Next's file-convention route (replaces the old static
 * app/favicon.ico), generated from the same branding as /manifest-icon so the tab icon
 * always matches whatever's set on /admin/settings. */
export default async function Icon() {
  const settings = await getPlatformSettings();
  return new ImageResponse(await brandIconElement(settings, 18), size);
}
