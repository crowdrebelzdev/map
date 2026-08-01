"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { EventMapViewProps } from "./event-map-view-inner";

// `ssr: false` below means Next.js can't inject its usual automatic
// <link rel="preload"> for this chunk (that only happens during SSR) — so the browser
// otherwise doesn't start fetching maplibre-gl (the largest chunk on this page) until
// React's hydration actually reaches this component. Firing the same import() here, at
// module scope, starts that fetch as soon as this (small, eagerly-bundled) wrapper file
// itself is evaluated, instead of waiting for hydration to reach the lazy boundary.
// Guarded because this module also gets evaluated server-side during SSR of the wrapper.
if (typeof window !== "undefined") {
  void import("./event-map-view-inner");
}

const EventMapViewInner = dynamic(() => import("./event-map-view-inner"), {
  ssr: false,
  // No skeleton here — the plattegrond image below already fills this space, immediately
  // and without waiting on any JS, so there's nothing extra to show while the chunk loads.
  loading: () => null,
});

/** Wraps the (lazy-loaded, client-only) real map. Maplibre-gl is ~1MB and, because it needs
 * `window` at import time, can't be server-rendered — so on a cold load the browser would
 * otherwise show nothing for this whole component until that download, parse and WebGL init
 * finishes (this was measured at ~7s on mobile for this page). Since the flat plattegrond
 * image is already sitting on the server and is tiny by comparison, show that immediately as
 * a plain `<img>` — real content the very first paint can include — and only swap to the
 * interactive map once it has actually finished rendering (`onMapReady`, not just started).
 */
export function EventMapView({ mapImage, className, onMapReady, ...rest }: EventMapViewProps) {
  const [interactiveReady, setInteractiveReady] = useState(false);

  return (
    <div className={cn("relative h-full w-full", className)}>
      {mapImage && !interactiveReady && (
        <img
          src={mapImage.imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-10 h-full w-full object-cover"
        />
      )}
      <EventMapViewInner
        mapImage={mapImage}
        {...rest}
        onMapReady={() => {
          setInteractiveReady(true);
          onMapReady?.();
        }}
      />
    </div>
  );
}

export type {
  EventMapViewProps,
  EventMapImage,
  EventMapPoi,
  EventMapPoiCategory,
  EventMapArea,
  EventMapAreaCategory,
  EventMapLiveUser,
  FlyToTarget,
  PoiSelectSignal,
  PreviewPoiMarker,
} from "./event-map-view-inner";
