"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePlatformSettings } from "@/actions/platform-settings";
import type { PlatformSettings } from "@/lib/platform-settings";
import type { PublicAccessMode } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const EVENT_ACCESS_OPTIONS: { value: PublicAccessMode; label: string }[] = [
  { value: "members_only", label: "Alleen inzichtelijk voor gebruikers" },
  { value: "public_anonymous", label: "Publiekelijk toegankelijk — zonder naam" },
  { value: "public_named", label: "Publiekelijk toegankelijk — met invullen naam" },
];

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePlatformSettings(form);
      toast.success("Instellingen opgeslagen.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Onderhoudsmodus</CardTitle>
          <CardDescription>Toont een melding boven de hele app voor alle bezoekers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Switch
              id="maintenance-mode"
              checked={form.maintenanceMode}
              onCheckedChange={(v) => setForm((f) => ({ ...f, maintenanceMode: v }))}
            />
            <Label htmlFor="maintenance-mode">Onderhoudsmodus aan</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="maintenance-message">Bericht</Label>
            <Textarea
              id="maintenance-message"
              value={form.maintenanceMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, maintenanceMessage: e.target.value }))}
              placeholder="Er is momenteel onderhoud bezig."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organisaties</CardTitle>
          <CardDescription>
            Standaard staat dit uit — nieuwe organisaties ontstaan dan alleen via /admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2.5">
            <Switch
              id="org-self-registration"
              checked={form.allowOrgSelfRegistration}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allowOrgSelfRegistration: v }))}
            />
            <Label htmlFor="org-self-registration">Gebruikers kunnen zelf een organisatie aanmaken</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="platform-name">Platformnaam</Label>
            <Input
              id="platform-name"
              value={form.platformName}
              onChange={(e) => setForm((f) => ({ ...f, platformName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="logo-initial">Logo-letter</Label>
            <Input
              id="logo-initial"
              value={form.logoInitial}
              onChange={(e) => setForm((f) => ({ ...f, logoInitial: e.target.value.slice(0, 2) }))}
              maxLength={2}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand-color">Merkkleur</Label>
            <div className="flex items-center gap-2">
              <input
                id="brand-color"
                type="color"
                value={form.brandColor}
                onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
                className="h-9 w-12 shrink-0 rounded-md border"
              />
              <Input
                value={form.brandColor}
                onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evenementen</CardTitle>
          <CardDescription>Standaard toegangsniveau voor nieuw aangemaakte evenementen.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={form.defaultEventAccessMode}
            onValueChange={(v) => v && setForm((f) => ({ ...f, defaultEventAccessMode: v as PublicAccessMode }))}
            className="gap-3"
          >
            {EVENT_ACCESS_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2.5">
                <RadioGroupItem value={opt.value} id={`event-access-${opt.value}`} />
                <Label htmlFor={`event-access-${opt.value}`} className="cursor-pointer font-normal">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Bezig..." : "Instellingen opslaan"}
        </Button>
      </div>
    </form>
  );
}
