"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { platformSettings, publicAccessModeValues, type PublicAccessMode } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/org-access";
import { PLATFORM_SETTINGS_ID, type PlatformSettings } from "@/lib/platform-settings";

export async function updatePlatformSettings(input: Partial<PlatformSettings>) {
  await requirePlatformAdmin();
  const t = await getTranslations("actionErrors");

  if (input.defaultEventAccessMode && !publicAccessModeValues.includes(input.defaultEventAccessMode)) {
    throw new Error(t("invalidDefaultAccessMode"));
  }
  if (input.platformName !== undefined && !input.platformName.trim()) {
    throw new Error(t("platformNameRequired"));
  }
  if (input.logoInitial !== undefined && !input.logoInitial.trim()) {
    throw new Error(t("logoInitialRequired"));
  }

  const values = {
    id: PLATFORM_SETTINGS_ID,
    maintenanceMode: input.maintenanceMode ?? false,
    maintenanceMessage: input.maintenanceMessage ?? null,
    allowOrgSelfRegistration: input.allowOrgSelfRegistration ?? false,
    defaultEventAccessMode: (input.defaultEventAccessMode ?? "members_only") as PublicAccessMode,
    platformName: input.platformName?.trim() ?? "Eventkaart",
    logoInitial: input.logoInitial?.trim().slice(0, 2) ?? "K",
    brandColor: input.brandColor ?? "#2563eb",
    updatedAt: new Date(),
  };

  await db
    .insert(platformSettings)
    .values(values)
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: {
        ...(input.maintenanceMode !== undefined && { maintenanceMode: input.maintenanceMode }),
        ...(input.maintenanceMessage !== undefined && { maintenanceMessage: input.maintenanceMessage }),
        ...(input.allowOrgSelfRegistration !== undefined && {
          allowOrgSelfRegistration: input.allowOrgSelfRegistration,
        }),
        ...(input.defaultEventAccessMode !== undefined && {
          defaultEventAccessMode: input.defaultEventAccessMode,
        }),
        ...(input.platformName !== undefined && { platformName: values.platformName }),
        ...(input.logoInitial !== undefined && { logoInitial: values.logoInitial }),
        ...(input.brandColor !== undefined && { brandColor: input.brandColor }),
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/", "layout");
}
