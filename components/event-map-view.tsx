"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
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
 * finishes (this was measured at ~7s on mobile for this page). Since the plattegrond's
 * display copy is already sitting on the server, show that immediately as a plain `<img>` —
 * real content the very first paint can include — and only swap to the interactive map once
 * it has actually finished rendering (`onMapReady`, not just started). Deliberately the
 * resized-down `displayImageUrl`, not the full-resolution `imageUrl` (which can be tens of
 * MB, see eventMap.displayImageUrl's schema comment) — using the full one here would make
 * the "instant" preview itself slow to load, defeating the point.
 *
 * Blurred, with a "Kaart laden..." pill on top: the plattegrond itself isn't the important
 * part of this preview (the interactive map is) — the blur makes that priority obvious and
 * doubles as a clear "this isn't final yet" signal, backed up by the pill so it never reads
 * as finished/broken.
 */
export function EventMapView({ mapImage, className, onMapReady, ...rest }: EventMapViewProps) {
  const [interactiveReady, setInteractiveReady] = useState(false);

  return (
    <div className={cn("relative h-full w-full", className)}>
      {mapImage && !interactiveReady && (
        <>
          <img
            src={mapImage.displayImageUrl ?? mapImage.imageUrl}
            alt=""
            aria-hidden="true"
            // Scaled up slightly so the blur's softened edges fall outside the visible
            // area instead of showing as a lighter border around the image.
            className="absolute inset-0 z-10 h-full w-full scale-105 object-cover blur-sm"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background shadow-md backdrop-blur-sm">
              <Spinner className="size-3.5" />
              Kaart laden...
            </div>
          </div>
        </>
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
