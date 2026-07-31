import { getPlatformSettings } from "@/lib/platform-settings";
import { PlatformSettingsForm } from "@/components/platform-settings-form";

export default async function PlatformSettingsPage() {
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Platform-instellingen</h1>
        <p className="text-sm text-muted-foreground">Geldt voor de hele app, over alle organisaties heen.</p>
      </div>
      <PlatformSettingsForm settings={settings} />
    </div>
  );
}
