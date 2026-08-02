import { getTranslations } from "next-intl/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import { PlatformSettingsForm } from "@/components/platform-settings-form";

export default async function PlatformSettingsPage() {
  const t = await getTranslations("platformSettings");
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PlatformSettingsForm settings={settings} />
    </div>
  );
}
