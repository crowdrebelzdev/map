"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeToPush, unsubscribeFromPush } from "@/actions/push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Standard VAPID-key conversion: PushManager.subscribe wants the applicationServerKey as a
// Uint8Array, VAPID public keys are handed out as URL-safe base64.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64Safe);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Opt-in bell button for broadcast push notifications — only rendered when the server has
 * VAPID keys configured (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` set) and the browser supports Push.
 * Never auto-prompts; permission is only requested on an explicit click, since browsers
 * ignore/penalize permission prompts fired without a user gesture anyway. */
export function PushSubscribeButton({ eventId }: { eventId: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => {});
  }, []);

  async function handleClick() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      if (subscribed) {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await unsubscribeFromPush(eventId, existing.endpoint);
          await existing.unsubscribe();
        }
        setSubscribed(false);
        toast.success("Meldingen uitgeschakeld.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Geef toestemming voor meldingen om dit te gebruiken.");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
      await subscribeToPush(eventId, subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setSubscribed(true);
      toast.success("Meldingen ingeschakeld voor dit event.");
    } catch {
      toast.error("Inschakelen van meldingen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={handleClick}
      disabled={busy}
      className="pointer-events-auto shrink-0 shadow-md"
    >
      {subscribed ? <BellRing /> : <Bell />}
      <span className="sr-only">
        {subscribed ? "Meldingen uitschakelen" : "Meldingen inschakelen voor broadcasts"}
      </span>
    </Button>
  );
}
