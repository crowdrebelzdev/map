"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { downloadMapForOffline, registerServiceWorker, type TileBounds } from "@/lib/offline";
import type { eventMap } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;

// Fixed id, same pattern as the tile-generation/upload toasts elsewhere in this app —
// replaces the same toast through downloading -> done/mislukt instead of stacking a new
// one on every progress tick.
const OFFLINE_TOAST_ID = "offline-download";

/** Offline-availability state for the operational map: connectivity detection, the
 * download-for-offline flow (with progress), and a silent background refresh whenever the
 * device regains connectivity for an event that was already saved for offline use — so it
 * never goes stale without anyone having to remember to press the button again.
 * `tileUrlTemplate` mirrors the same prop threaded into EventMapImage["tiles"] — null falls
 * back to downloading the flat image exactly as before tiles existed. */
export function useOfflineMap(map: MapRow | null, tileUrlTemplate: string | null) {
  const t = useTranslations("publicMap");
  const [isOnline, setIsOnline] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [offlineProgress, setOfflineProgress] = useState({ done: 0, total: 0 });
  // Hidden by default until the mount effect below confirms (from localStorage) that this
  // visitor hasn't already dismissed it for this event — avoids a one-frame flash of the tip
  // for returning visitors.
  const [tipDismissed, setTipDismissed] = useState(true);

  useEffect(() => {
    // navigator isn't available during SSR render — has to be an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    registerServiceWorker();
    // localStorage isn't available during SSR render — has to be an effect.
    if (map && localStorage.getItem(`offline-map-${map.eventId}`)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOfflineStatus("done");
    }
    if (map && !localStorage.getItem(`offline-tip-dismissed-${map.eventId}`)) {
      setTipDismissed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId]);

  function dismissOfflineTip() {
    if (map) localStorage.setItem(`offline-tip-dismissed-${map.eventId}`, "1");
    setTipDismissed(true);
  }

  // Only while nothing has happened yet (no download in progress, none saved, no failed
  // attempt still lingering) — once the visitor has engaged with it either way, don't nag.
  const showOfflineTip = !tipDismissed && offlineStatus === "idle";

  async function runOfflineDownload(mapRow: MapRow, silent: boolean) {
    setOfflineStatus("downloading");
    setOfflineProgress({ done: 0, total: 0 });
    // Silent background refreshes (see the effect below) stay silent on purpose — same
    // reasoning as the success/error toasts already being skipped for those below, a
    // refresh the visitor didn't ask for shouldn't interrupt them with a progress toast.
    if (!silent) toast.loading(t("offlineDownloading", { done: 0, total: "?" }), { id: OFFLINE_TOAST_ID });
    try {
      const lats = [mapRow.cornerTlLat, mapRow.cornerTrLat, mapRow.cornerBrLat, mapRow.cornerBlLat];
      const lngs = [mapRow.cornerTlLng, mapRow.cornerTrLng, mapRow.cornerBrLng, mapRow.cornerBlLng];
      const bounds: TileBounds = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      };
      const plattegrondTiles =
        tileUrlTemplate && mapRow.tileMinZoom != null && mapRow.tileMaxZoom != null
          ? { urlTemplate: tileUrlTemplate, minZoom: mapRow.tileMinZoom, maxZoom: mapRow.tileMaxZoom }
          : null;
      await downloadMapForOffline(bounds, mapRow.imageUrl, plattegrondTiles, (done, total) => {
        setOfflineProgress({ done, total });
        if (!silent) toast.loading(t("offlineDownloading", { done, total: total || "?" }), { id: OFFLINE_TOAST_ID });
      });
      localStorage.setItem(`offline-map-${mapRow.eventId}`, String(Date.now()));
      setOfflineStatus("done");
      if (!silent) toast.success(t("offlineSaveSuccess"), { id: OFFLINE_TOAST_ID });
    } catch {
      setOfflineStatus("error");
      // A failed silent background refresh isn't user-actionable (probably just a
      // flaky connection) and the existing offline copy still works fine, so only
      // surface an error for an explicit, user-initiated download.
      if (!silent) toast.error(t("offlineSaveError"), { id: OFFLINE_TOAST_ID });
    }
  }

  function handleDownloadOffline() {
    if (!map) return;
    runOfflineDownload(map, false);
  }

  useEffect(() => {
    if (!map || !isOnline) return;
    if (!localStorage.getItem(`offline-map-${map.eventId}`)) return;
    // Kicks off a genuine side effect (network fetch) in response to regained
    // connectivity for an already-offline-saved event — not a render-derived reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runOfflineDownload(map, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId, isOnline]);

  return { isOnline, offlineStatus, offlineProgress, handleDownloadOffline, showOfflineTip, dismissOfflineTip };
}
