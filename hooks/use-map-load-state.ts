"use client";

import { useRef, useState, type RefObject } from "react";
import type { MapRef, MapSourceDataEvent } from "react-map-gl/maplibre";
import type { EventMapImage } from "@/components/event-map-view-inner";

/** Tracks when the map is visually ready to show — not just "the style loaded" (`onLoad`)
 * but "the plattegrond's own source has actually painted too" (`onSourceData`), so a parent
 * can swap away a static loading placeholder without a flash of the bare basemap first. */
export function useMapLoadState(
  mapRef: RefObject<MapRef | null>,
  mapImage: EventMapImage | null,
  onMapReady: (() => void) | undefined,
) {
  const mapReadyFiredRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  function handleMapLoad() {
    setLoaded(true);
    // MapLibre's compact attribution briefly shows the full credit line on first
    // load before collapsing to just the icon on the next drag — collapse it
    // immediately instead so it never flashes the full text at all.
    mapRef.current
      ?.getMap()
      .getContainer()
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show");
    // No plattegrond configured for this event at all — nothing else to wait for, so
    // the map is as "ready" as it'll ever be as soon as the base style has loaded (the
    // `onSourceData` check below only ever fires for the plattegrond's own source, so
    // without one this would otherwise wait forever).
    if (!mapImage && !mapReadyFiredRef.current) {
      mapReadyFiredRef.current = true;
      onMapReady?.();
    }
  }

  function handleMapSourceData(e: MapSourceDataEvent) {
    // Specifically the plattegrond's own source (tiles or the flat-image fallback —
    // exactly one of the two exists whenever `mapImage` is set), not just "the style
    // finished loading" (`onLoad`) or "nothing is pending right now" (the `idle` event
    // this used to key off of): `loaded` only flips true *after* `onLoad` already ran,
    // and the Source below is only added to the map on the *next* render after that —
    // maplibre-gl's own `idle` event can fire in the gap between those two, before the
    // plattegrond source was even added yet, handing control back to the parent while
    // the map underneath still has nothing plattegrond-related loaded or even queued.
    if (mapReadyFiredRef.current) return;
    if ((e.sourceId === "event-map-tiles" || e.sourceId === "event-map-image") && e.isSourceLoaded) {
      mapReadyFiredRef.current = true;
      onMapReady?.();
    }
  }

  return { loaded, handleMapLoad, handleMapSourceData };
}
