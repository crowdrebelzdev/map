"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { updatePublicAccessMode } from "@/actions/events";
import type { PublicAccessMode } from "@/db/schema";

const OPTIONS: { value: PublicAccessMode; label: string; description: string }[] = [
  {
    value: "members_only",
    label: "Alleen inzichtelijk voor gebruikers",
    description:
      "Alleen teamleden die aan dit event zijn toegevoegd (of organisatiebeheerders) kunnen de publieke kaart openen. Zoals nu.",
  },
  {
    value: "public_anonymous",
    label: "Publiekelijk toegankelijk — zonder naam",
    description:
      "Iedereen met de link kan de kaart direct openen, zonder in te loggen of iets in te vullen. Live-locatie delen, incidenten melden en broadcast-berichten blijven voorbehouden aan teamleden.",
  },
  {
    value: "public_named",
    label: "Publiekelijk toegankelijk — met invullen naam",
    description:
      "Iedereen met de link kan de kaart openen, maar moet eerst een naam invullen om verder te gaan. De naam wordt alleen lokaal in de browser gebruikt als toegangsdrempel — niet opgeslagen op de server.",
  },
];

export function EventAccessSettings({
  eventId,
  eventSlug,
  currentMode,
}: {
  eventId: string;
  eventSlug: string;
  currentMode: PublicAccessMode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PublicAccessMode>(currentMode);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    const nextMode = next as PublicAccessMode;
    setMode(nextMode);
    setSaving(true);
    try {
      await updatePublicAccessMode(eventId, eventSlug, nextMode);
      toast.success("Toegangsniveau opgeslagen.");
      router.refresh();
    } catch (err) {
      setMode(currentMode);
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Toegang tot de publieke kaart</CardTitle>
          <CardDescription>
            Bepaalt wie de kaart op <code>/events/{eventSlug}/map</code> kan openen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={handleChange} disabled={saving} className="gap-4">
            {OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-start gap-3">
                <RadioGroupItem value={opt.value} id={opt.value} className="mt-1" />
                <Label htmlFor={opt.value} className="flex-1 cursor-pointer font-normal">
                  <span className="block font-medium text-foreground">{opt.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{opt.description}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}
