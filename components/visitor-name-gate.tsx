"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function storageKey(eventId: string) {
  return `visitor-name-${eventId}`;
}

/** One-time-per-tab-session gate for "publiek met naam" events — the name is purely a
 * threshold to get past (never sent to the server, see `db/schema.ts`'s `publicAccessMode`
 * comment), kept in `sessionStorage` so a refresh doesn't ask again but a fresh tab/visit
 * does. */
export function VisitorNameGate({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const t = useTranslations("visitorNameGate");

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(storageKey(eventId)) !== null);
  }, [eventId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    sessionStorage.setItem(storageKey(eventId), trimmed);
    setUnlocked(true);
  }

  // Briefly blank while sessionStorage is checked (unavoidable client-only check) — avoids
  // flashing the form for visitors who already passed the gate earlier this session.
  if (unlocked === null) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("welcome")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="visitor-name">{t("nameLabel")}</Label>
              <Input
                id="visitor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              {t("continue")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
