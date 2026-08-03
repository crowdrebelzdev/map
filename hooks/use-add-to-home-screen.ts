"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Nudges a visitor who just saved the map offline (see useOfflineMap) to also add it to
 * their home screen — the shortcut opens straight into this event's cached map (see
 * generateMetadata in app/events/[eventSlug]/map/page.tsx for the per-event manifest that
 * makes this possible), which is faster than reopening the browser and navigating back.
 * There's no single cross-platform API for this: iOS Safari has no install prompt at all
 * (needs manual "Delen -> Zet op beginscherm" instructions), Android Chrome fires
 * `beforeinstallprompt` which we capture and can trigger programmatically, and other
 * browsers (Firefox, in-app browsers) get neither — those fall back to the same manual
 * instructions as iOS. */
export function useAddToHomeScreen(eventId: string | null, enabled: boolean) {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // navigator/window/localStorage aren't available during SSR render — has to be an effect.
    const ua = navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(/iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other");
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari's own (non-standard) flag — matchMedia above doesn't cover it there.
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (eventId) setDismissed(!!localStorage.getItem(`home-screen-tip-dismissed-${eventId}`));
  }, [eventId]);

  function dismissHint() {
    if (eventId) localStorage.setItem(`home-screen-tip-dismissed-${eventId}`, "1");
    setDismissed(true);
  }

  async function promptInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === "accepted") dismissHint();
  }

  // Desktop has no meaningful "home screen" — this hint is mobile-only.
  const showHint = enabled && platform !== "other" && !isStandalone && !dismissed;

  return { showHint, dismissHint, platform, canPromptInstall: installPrompt !== null, promptInstall };
}
