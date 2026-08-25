"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { platformSettings, publicAccessModeValues, type PublicAccessMode } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/org-access";
import { PLATFORM_SETTINGS_ID, getPlatformSettings, type PlatformSettings } from "@/lib/platform-settings";
import {
  getPlatformLogoUploadPlan,
  savePlatformLogo,
  deletePlatformLogo,
  type LogoUploadPlan,
} from "@/lib/storage";

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

  // A replaced/removed logo leaves its old file orphaned in storage otherwise — best-effort
  // cleanup, never blocks the settings update itself (see deletePlatformLogo).
  if (input.logoUrl !== undefined) {
    const current = await getPlatformSettings();
    if (current.logoUrl && current.logoUrl !== input.logoUrl) {
      await deletePlatformLogo(current.logoUrl);
    }
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
    logoUrl: input.logoUrl ?? null,
    metaDescription: input.metaDescription?.trim() || null,
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
        ...(input.logoUrl !== undefined && { logoUrl: values.logoUrl }),
        ...(input.metaDescription !== undefined && { metaDescription: values.metaDescription }),
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/", "layout");
}

/** Hands the client either a presigned S3 PUT URL or a "local" signal for the logo it's
 * about to upload — see getPlatformLogoUploadPlan for which, and why. */
export async function prepareLogoUpload(contentType: string): Promise<LogoUploadPlan> {
  await requirePlatformAdmin();
  return getPlatformLogoUploadPlan(contentType);
}

/** Local-dev fallback: carries the file through the server action itself (see
 * getPlatformLogoUploadPlan's "local" mode) — zero-setup local dev has no S3 to presign
 * against. Returns the resulting URL; the caller still has to call updatePlatformSettings
 * with it to actually persist it (this only uploads the file, same split as prepareLogoUpload
 * + the client PUT for the S3 path). */
export async function uploadPlatformLogo(formData: FormData): Promise<{ logoUrl: string }> {
  await requirePlatformAdmin();
  const t = await getTranslations("actionErrors");

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error(t("invalidImage"));
  }

  const logoUrl = await savePlatformLogo(file);
  return { logoUrl };
}
