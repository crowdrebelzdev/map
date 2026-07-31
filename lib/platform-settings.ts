import { cache } from "react";
import { db } from "@/db";
import type { PublicAccessMode } from "@/db/schema";

export const PLATFORM_SETTINGS_ID = "platform";

export type PlatformSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  allowOrgSelfRegistration: boolean;
  defaultEventAccessMode: PublicAccessMode;
  platformName: string;
  logoInitial: string;
  brandColor: string;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: null,
  allowOrgSelfRegistration: false,
  defaultEventAccessMode: "members_only",
  platformName: "Eventkaart",
  logoInitial: "K",
  brandColor: "#2563eb",
};

/** Reads the single platform-config row (see db/schema.ts's `platformSettings`) — falls
 * back to hardcoded defaults if the row is somehow missing rather than throwing, since this
 * is read on effectively every request (branding, maintenance banner, org self-registration
 * check). Wrapped in React's `cache()` so the several call sites within one request (root
 * layout, nested layouts, Better Auth's org-creation check) only hit the database once. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const row = await db.query.platformSettings.findFirst();
  if (!row) return DEFAULT_PLATFORM_SETTINGS;

  return {
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    allowOrgSelfRegistration: row.allowOrgSelfRegistration,
    defaultEventAccessMode: row.defaultEventAccessMode,
    platformName: row.platformName,
    logoInitial: row.logoInitial,
    brandColor: row.brandColor,
  };
});
