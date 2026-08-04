"use client";

import { useEffect, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { FlyToTarget } from "@/components/event-map-view-inner";

/** Flies/fits the map to a target requested by a parent (e.g. a search result) — a pure
 * side effect with nothing to return. */
export function useFlyToTarget(
  mapRef: RefObject<MapRef | null>,
  loaded: boolean,
  flyToTarget: FlyToTarget | null | undefined,
) {
  useEffect(() => {
    if (!loaded || !flyToTarget || !mapRef.current) return;
    if (flyToTarget.type === "bounds") {
      // fitBounds defaults bearing to 0 unless told otherwise — without this, flying to a
      // search/grid/POI result would silently straighten out a rotated/locked map.
      const map = mapRef.current.getMap();
      mapRef.current.fitBounds(flyToTarget.bounds, { padding: 60, duration: 800, bearing: map.getBearing() });
    } else {
      mapRef.current.flyTo({
        center: [flyToTarget.center.lng, flyToTarget.center.lat],
        zoom: flyToTarget.zoom ?? 19,
        duration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToTarget, loaded]);
}
