"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type HomeScreenPlatform = "ios-safari" | "ios-other" | "android" | "other";

// Third-party iOS browsers (Chrome, Firefox, Edge, ...) and in-app webviews (Instagram,
// WhatsApp, ...) can't add a real home-screen shortcut the way Safari can. Chrome's own
// "Add to Home Screen" falls back to downloading an iOS configuration profile to install the
// shortcut — Chrome lacks the private entitlement Safari has to do this invisibly — and iOS
// then rejects that profile as invalid, a dead end for the visitor. So rather than pointing
// at each browser's own (broken or missing) install option, anything on iOS that isn't
// confirmed-Safari gets steered to open the page in Safari instead, where this has always
// worked cleanly.
const IOS_OTHER_BROWSER_TOKENS =
  /crios|fxios|edgios|opios|duckduckgo|samsungbrowser|instagram|fban|fbav|\bline\/|micromessenger/i;

function detectPlatform(ua: string): HomeScreenPlatform {
  if (/iphone|ipad|ipod/i.test(ua)) {
    // Real Safari's UA carries "Version/" (its own version token) and none of the other
    // browsers'/webviews' markers above — anything that doesn't clear both checks is treated
    // as "not Safari" on purpose, since a false "ios-safari" would show Delen-instructions
    // that don't apply there, while a false "ios-other" just shows a redundant (but harmless)
    // nudge to a visitor already in Safari.
    const looksLikeSafari = /version\//i.test(ua) && !IOS_OTHER_BROWSER_TOKENS.test(ua);
    return looksLikeSafari ? "ios-safari" : "ios-other";
  }
  if (/android/i.test(ua)) return "android";
  return "other";
}

/** Nudges a visitor who just saved the map offline (see useOfflineMap) to also add it to
 * their home screen — the shortcut opens straight into this event's cached map (see
 * generateMetadata in app/events/[eventSlug]/map/page.tsx for the per-event manifest that
 * makes this possible), which is faster than reopening the browser and navigating back.
 * Android (Chrome/Edge/Samsung Internet) gets the native `beforeinstallprompt` flow; iOS
 * Safari gets manual Delen-instructions; iOS non-Safari gets handed off to Safari (see
 * `IOS_OTHER_BROWSER_TOKENS` above for why); everything else gets generic menu instructions. */
export function useAddToHomeScreen(eventId: string | null, enabled: boolean) {
  const t = useTranslations("publicMap");
  const [platform, setPlatform] = useState<HomeScreenPlatform>("other");
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);

  useEffect(() => {
    // navigator/window/localStorage aren't available during SSR render — has to be an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform(navigator.userAgent));
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari's own (non-standard) flag — matchMedia above doesn't cover it there.
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    setPageUrl(window.location.href);

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

  // Fired alongside the `x-safari-` handoff link below (see `safariHandoffHref`) — that
  // custom scheme isn't guaranteed to fire from every in-app webview, so the visitor gets the
  // URL on their clipboard as a manual fallback regardless of whether the handoff worked.
  function handleSafariHandoffClick() {
    if (pageUrl) {
      navigator.clipboard
        .writeText(pageUrl)
        .then(() => toast.success(t("homeScreenTipLinkCopied")))
        .catch(() => {});
    }
    dismissHint();
  }

  // Apple registers this scheme so any app can force a URL to open in Safari specifically —
  // used to hand an "ios-other" visitor straight there instead of leaving them to find (and
  // hit the broken configuration-profile flow of) their current browser's own install option.
  const safariHandoffHref = pageUrl ? `x-safari-${pageUrl}` : undefined;

  // Desktop has no meaningful "home screen" — this hint is mobile-only.
  const showHint = enabled && platform !== "other" && !isStandalone && !dismissed;

  return {
    showHint,
    dismissHint,
    platform,
    canPromptInstall: installPrompt !== null,
    promptInstall,
    safariHandoffHref,
    handleSafariHandoffClick,
  };
}
