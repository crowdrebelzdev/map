"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { updateLiveLocation } from "@/actions/live-location";
import type { LatLng } from "@/lib/geo";

/** Automatically and periodically shares the real GPS position while this page is open —
 * powers the backoffice "live locations" view. Best-effort: a failed upload (flaky signal)
 * is silently dropped rather than shown to the field user. Public (non-staff) visitors never
 * share their location with the command center — the action requires a real account anyway,
 * and would just fail for them. */
export function useLiveLocationSharing(
  eventId: string,
  isStaff: boolean,
  latestGpsRef: RefObject<LatLng | null>,
) {
  useEffect(() => {
    if (!isStaff) return;
    const id = setInterval(() => {
      const pos = latestGpsRef.current;
      if (!pos) return;
      updateLiveLocation(eventId, pos.lat, pos.lng, null).catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isStaff]);
}
