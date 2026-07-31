"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { downloadMapForOffline, registerServiceWorker, type TileBounds } from "@/lib/offline";
import type { eventMap } from "@/db/schema";

type MapRow = typeof eventMap.$inferSelect;

/** Offline-availability state for the operational map: connectivity detection, the
 * download-for-offline flow (with progress), and a silent background refresh whenever the
 * device regains connectivity for an event that was already saved for offline use — so it
 * never goes stale without anyone having to remember to press the button again. */
export function useOfflineMap(map: MapRow | null) {
  const t = useTranslations("publicMap");
  const [isOnline, setIsOnline] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [offlineProgress, setOfflineProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
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
    if (map && localStorage.getItem(`offline-map-${map.eventId}`)) {
      setOfflineStatus("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId]);

  async function runOfflineDownload(mapRow: MapRow, silent: boolean) {
    setOfflineStatus("downloading");
    setOfflineProgress({ done: 0, total: 0 });
    try {
      const lats = [mapRow.cornerTlLat, mapRow.cornerTrLat, mapRow.cornerBrLat, mapRow.cornerBlLat];
      const lngs = [mapRow.cornerTlLng, mapRow.cornerTrLng, mapRow.cornerBrLng, mapRow.cornerBlLng];
      const bounds: TileBounds = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      };
      await downloadMapForOffline(bounds, mapRow.imageUrl, (done, total) =>
        setOfflineProgress({ done, total }),
      );
      localStorage.setItem(`offline-map-${mapRow.eventId}`, String(Date.now()));
      setOfflineStatus("done");
      if (!silent) toast.success(t("offlineSaveSuccess"));
    } catch {
      setOfflineStatus("error");
      // A failed silent background refresh isn't user-actionable (probably just a
      // flaky connection) and the existing offline copy still works fine, so only
      // surface an error for an explicit, user-initiated download.
      if (!silent) toast.error(t("offlineSaveError"));
    }
  }

  function handleDownloadOffline() {
    if (!map) return;
    runOfflineDownload(map, false);
  }

  useEffect(() => {
    if (!map || !isOnline) return;
    if (!localStorage.getItem(`offline-map-${map.eventId}`)) return;
    runOfflineDownload(map, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.eventId, isOnline]);

  return { isOnline, offlineStatus, offlineProgress, handleDownloadOffline };
}
