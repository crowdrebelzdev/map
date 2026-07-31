"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "install-prompt-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Small dismissible pill offering to install the PWA — only renders once the browser has
 * actually signaled the app is installable (`beforeinstallprompt`), so it never appears on
 * browsers/platforms that don't support installation (e.g. iOS Safari). Rendered in the same
 * top status-pill slot as the offline banner in `operational-map.tsx` (mutually exclusive —
 * both are rare, transient states, no need to show both at once). */
export function InstallPromptBanner() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const t = useTranslations("installPrompt");

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === "accepted") setDeferredEvent(null);
  }

  if (!deferredEvent || dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-full bg-foreground/90 py-1.5 pr-2 pl-3 text-xs font-medium text-background shadow-md backdrop-blur-sm">
      <span>{t("message")}</span>
      <button
        type="button"
        onClick={handleInstall}
        className="flex items-center gap-1 rounded-full bg-background px-2 py-1 text-foreground"
      >
        <Download size={12} />
        {t("install")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-full p-1 text-background/70 hover:text-background"
      >
        <X size={13} />
        <span className="sr-only">{t("close")}</span>
      </button>
    </div>
  );
}
