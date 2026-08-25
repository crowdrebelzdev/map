import type { PlatformSettings } from "@/lib/platform-settings";

/** Wraps a transactional email's body HTML in a minimal branded shell — a header with the
 * platform name/logo in the brand color, and the body underneath. Keeps mails (password
 * reset, invites, ...) visually consistent with the rest of the app's /admin/settings
 * branding without every call site building its own header. Uses a plain <img>/text header
 * rather anything JS-driven — most mail clients strip that anyway. */
export function wrapBrandedEmail(settings: Pick<PlatformSettings, "platformName" | "brandColor">, bodyHtml: string): string {
  const { platformName, brandColor } = settings;

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: ${brandColor}; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0; font-size: 18px; font-weight: 700;">
        ${platformName}
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
        ${bodyHtml}
      </div>
    </div>
  `;
}
