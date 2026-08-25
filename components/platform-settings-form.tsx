"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updatePlatformSettings, prepareLogoUpload, uploadPlatformLogo } from "@/actions/platform-settings";
import { resizeImageFile } from "@/lib/resize-image";
import type { PlatformSettings } from "@/lib/platform-settings";
import type { PublicAccessMode } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// A logo is only ever rendered at icon size (favicon/PWA icon/OG preview) — 512px comfortably
// covers all of those, no reason to keep anything sharper client-side.
const LOGO_MAX_DIMENSION = 512;

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const t = useTranslations("platformSettingsForm");
  const tc = useTranslations("common");
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    e.target.value = "";
    if (!rawFile) return;

    setUploadingLogo(true);
    try {
      const file = await resizeImageFile(rawFile, LOGO_MAX_DIMENSION);
      // Same S3-direct-PUT-vs-local-FormData split as the plattegrond upload (see
      // map-image-editor.tsx) — a presigned URL when S3 is configured, otherwise the file
      // travels through the server action itself.
      const plan = await prepareLogoUpload(file.type);
      let logoUrl: string;
      if (plan.mode === "s3") {
        const putRes = await fetch(plan.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!putRes.ok) throw new Error(t("logoUploadError"));
        logoUrl = plan.publicUrl;
      } else {
        const formData = new FormData();
        formData.set("file", file);
        ({ logoUrl } = await uploadPlatformLogo(formData));
      }
      setForm((f) => ({ ...f, logoUrl }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("logoUploadError"));
    } finally {
      setUploadingLogo(false);
    }
  }

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
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="logo-upload">{t("logoLabel")}</Label>
            <div className="flex items-center gap-3">
              <div
                className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border text-sm font-semibold text-white"
                style={{ background: form.logoUrl ? undefined : form.brandColor }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- logoUrl can point at S3 or a local /uploads path, next/image isn't configured for either */}
                {form.logoUrl ? <img src={form.logoUrl} alt="" className="size-full object-contain" /> : form.logoInitial}
              </div>
              <Input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} disabled={uploadingLogo} className="max-w-xs" />
              {form.logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logoUrl: null }))}>
                  {t("logoRemove")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("seoTitle")}</CardTitle>
          <CardDescription>{t("seoDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label htmlFor="meta-description">{t("metaDescriptionLabel")}</Label>
            <Textarea
              id="meta-description"
              value={form.metaDescription}
              onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
              placeholder={t("metaDescriptionPlaceholder")}
              rows={2}
            />
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
        <Button type="submit" disabled={saving || uploadingLogo}>
          {saving ? tc("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
