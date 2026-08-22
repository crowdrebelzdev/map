"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function nameStorageKey(eventId: string) {
  return `visitor-name-${eventId}`;
}

function visitorIdStorageKey(eventId: string) {
  return `visitor-id-${eventId}`;
}

/** The name this visitor last entered (per tab session) + their visitor id, if they've
 * already passed the gate — read by `useVisitorLocationSharing` so it can report a position
 * under the same identity `VisitorNameGate` established. Returns null before the gate's been
 * passed (nothing stored yet) or outside the browser (SSR).
 *
 * The id is deliberately in `localStorage` (survives closing the tab/app), unlike the name
 * gate itself which re-prompts every fresh visit (sessionStorage) — otherwise every reconnect
 * (phone locked, app closed and reopened) would mint a new id and leave the previous one
 * behind as a permanent "laatst gezien" ghost on the live map instead of updating in place,
 * since live-location rows are never deleted (see actions/live-location.ts). */
export function getVisitorIdentity(eventId: string): { name: string; visitorId: string } | null {
  if (typeof window === "undefined") return null;
  const name = sessionStorage.getItem(nameStorageKey(eventId));
  const visitorId = localStorage.getItem(visitorIdStorageKey(eventId));
  return name && visitorId ? { name, visitorId } : null;
}

/** One-time-per-tab-session gate for "publiek met naam" events — kept in `sessionStorage` so
 * a refresh doesn't ask again but a fresh tab/visit does. The name itself is never sent to
 * the server on its own (see `db/schema.ts`'s `publicAccessMode` comment); it's only reported
 * alongside a location update once the visitor is through, same as any staff member's name
 * on the live-ops view — see `getVisitorIdentity` above. */
export function VisitorNameGate({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const t = useTranslations("visitorNameGate");

  useEffect(() => {
    // sessionStorage isn't available during SSR render — has to be an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlocked(sessionStorage.getItem(nameStorageKey(eventId)) !== null);
  }, [eventId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    sessionStorage.setItem(nameStorageKey(eventId), trimmed);
    if (!localStorage.getItem(visitorIdStorageKey(eventId))) {
      localStorage.setItem(visitorIdStorageKey(eventId), crypto.randomUUID());
    }
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
            <p className="text-xs text-muted-foreground">{t("locationNotice")}</p>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              {t("continue")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
