"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setLiveLocationEnabled } from "@/actions/events";

export function LiveLocationSettings({
  eventId,
  eventSlug,
  currentEnabled,
}: {
  eventId: string;
  eventSlug: string;
  currentEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(currentEnabled);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    setEnabled(next);
    setSaving(true);
    try {
      await setLiveLocationEnabled(eventId, eventSlug, next);
      toast.success("Live locatie-instelling opgeslagen.");
      router.refresh();
    } catch (err) {
      setEnabled(!next);
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Live locatie</CardTitle>
          <CardDescription>
            Bepaalt of teamleden en naam-only bezoekers hun locatie delen, en of die zichtbaar is op{" "}
            <code>/org/events/{eventSlug}/live</code>. Staat dit uit, dan stopt het delen direct en wordt niemand
            meer getoond — incidenten en broadcasts blijven gewoon werken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2.5">
            <Switch
              id="live-location-enabled"
              checked={enabled}
              onCheckedChange={handleChange}
              disabled={saving}
            />
            <Label htmlFor="live-location-enabled">Live locatie aan</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
