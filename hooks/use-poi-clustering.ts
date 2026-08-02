"use client";

import { useMemo } from "react";
import Supercluster, { type ClusterFeature, type PointFeature } from "supercluster";
import type { EventMapPoi } from "@/components/event-map-view-inner";
import type { MapViewport } from "@/hooks/use-map-viewport";

type PoiPointProps = { poiId: string };
type PoiClusterProps = Record<string, never>;

export function isClusterFeature(
  item: ClusterFeature<PoiClusterProps> | PointFeature<PoiPointProps>,
): item is ClusterFeature<PoiClusterProps> {
  return "cluster" in item.properties && item.properties.cluster === true;
}

export function usePoiClustering(visiblePois: EventMapPoi[], viewport: MapViewport | null) {
  const clusterIndex = useMemo(() => {
    // A smaller radius means points only merge once they're genuinely close together on
    // screen — i.e. clustering kicks in later, only once you're properly zoomed out.
    const index = new Supercluster<PoiPointProps, PoiClusterProps>({ radius: 32, maxZoom: 18 });
    index.load(
      visiblePois.map(
        (p): PointFeature<PoiPointProps> => ({
          type: "Feature",
          properties: { poiId: p.id },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        }),
      ),
    );
    return index;
  }, [visiblePois]);

  const clusterItems = useMemo(() => {
    if (!viewport) return [];
    return clusterIndex.getClusters(viewport.bounds, Math.round(viewport.zoom));
  }, [clusterIndex, viewport]);

  return { clusterIndex, clusterItems };
}
