"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { updateVisitorLocation } from "@/actions/live-location";
import { getVisitorIdentity } from "@/components/visitor-name-gate";
import type { LatLng } from "@/lib/geo";

/** Same idea as `useLiveLocationSharing`, but for anonymous "naam-only" visitors on a
 * `public_named` event. Reads the name/id `VisitorNameGate` stored in sessionStorage on each
 * tick rather than taking them as props — this hook (and the GPS watch feeding it) starts
 * running as soon as the operational map mounts, before the visitor has necessarily typed
 * their name yet, so there's nothing to read until the gate's been passed; ticks before then
 * (and any failed upload) are silently skipped. */
export function useVisitorLocationSharing(
  eventId: string,
  enabled: boolean,
  latestGpsRef: RefObject<LatLng | null>,
) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const pos = latestGpsRef.current;
      if (!pos) return;
      const identity = getVisitorIdentity(eventId);
      if (!identity) return;
      updateVisitorLocation(eventId, identity.visitorId, identity.name, pos.lat, pos.lng, null).catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, enabled]);
}
