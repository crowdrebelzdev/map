"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";

export type MapViewport = { zoom: number; bounds: [number, number, number, number] };

/** Tracked for POI clustering + zoom-gated labels — recomputed on every pan/zoom so
 * clusters stay in sync with what's actually on screen. */
export function useMapViewport(mapRef: RefObject<MapRef | null>, loaded: boolean): MapViewport | null {
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const map = mapRef.current.getMap();
    function updateViewport() {
      const b = map.getBounds();
      setViewport({
        zoom: map.getZoom(),
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      });
    }
    updateViewport();
    map.on("move", updateViewport);
    return () => {
      map.off("move", updateViewport);
    };
  }, [loaded, mapRef]);

  return viewport;
}
