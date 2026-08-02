"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const t = useTranslations("platformSettingsForm");
  const tc = useTranslations("common");
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  const EVENT_ACCESS_OPTIONS: { value: PublicAccessMode; label: string }[] = [
    { value: "members_only", label: t("accessMembersOnly") },
    { value: "public_anonymous", label: t("accessPublicAnonymous") },
    { value: "public_named", label: t("accessPublicNamed") },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePlatformSettings(form);
      toast.success(t("successToast"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorFallback"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("maintenanceTitle")}</CardTitle>
          <CardDescription>{t("maintenanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Switch
              id="maintenance-mode"
              checked={form.maintenanceMode}
              onCheckedChange={(v) => setForm((f) => ({ ...f, maintenanceMode: v }))}
            />
            <Label htmlFor="maintenance-mode">{t("maintenanceModeOn")}</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="maintenance-message">{t("messageLabel")}</Label>
            <Textarea
              id="maintenance-message"
              value={form.maintenanceMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, maintenanceMessage: e.target.value }))}
              placeholder={t("messagePlaceholder")}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("organizationsTitle")}</CardTitle>
          <CardDescription>{t("organizationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2.5">
            <Switch
              id="org-self-registration"
              checked={form.allowOrgSelfRegistration}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allowOrgSelfRegistration: v }))}
            />
            <Label htmlFor="org-self-registration">{t("selfRegistrationLabel")}</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("brandingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="platform-name">{t("platformNameLabel")}</Label>
            <Input
              id="platform-name"
              value={form.platformName}
              onChange={(e) => setForm((f) => ({ ...f, platformName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="logo-initial">{t("logoInitialLabel")}</Label>
            <Input
              id="logo-initial"
              value={form.logoInitial}
              onChange={(e) => setForm((f) => ({ ...f, logoInitial: e.target.value.slice(0, 2) }))}
              maxLength={2}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand-color">{t("brandColorLabel")}</Label>
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
          <CardTitle>{t("eventsTitle")}</CardTitle>
          <CardDescription>{t("eventsDescription")}</CardDescription>
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
          {saving ? tc("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
