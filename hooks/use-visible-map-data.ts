"use client";

import { useMemo } from "react";
import type { GridCell, LatLng } from "@/lib/geo";
import { gridCellsToGeoJSON } from "@/lib/geo";
import type {
  EventMapArea,
  EventMapAreaCategory,
  EventMapPoi,
  EventMapPoiCategory,
} from "@/components/event-map-view-inner";

/** Every derived value that does *not* depend on selection state — filtered/indexed POIs
 * and areas, plus the geojson feature collections for the grid, the search-highlighted
 * cell, and the in-progress drawing outline. `areasGeoJson` (which needs `dimmed`, and so
 * needs selection state) lives in `useMapSelection` instead — keeping it here would create
 * a circular dependency between the two hooks. */
export function useVisibleMapData({
  pois,
  categories,
  visibleCategories,
  extraVisiblePoiId,
  areas,
  areaCategories,
  visibleAreaCategoryIds,
  gridCells,
  highlightedCell,
  drawingVertices,
}: {
  pois: EventMapPoi[];
  categories: EventMapPoiCategory[];
  visibleCategories: string[] | undefined;
  extraVisiblePoiId: string | null | undefined;
  areas: EventMapArea[];
  areaCategories: EventMapAreaCategory[];
  visibleAreaCategoryIds: string[] | undefined;
  gridCells: GridCell[];
  highlightedCell: GridCell | null | undefined;
  drawingVertices: LatLng[] | null | undefined;
}) {
  // Not `new Map(...)` — this file imports `Map` from react-map-gl for the map component,
  // which shadows the built-in Map constructor.
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const visiblePois = useMemo(
    () =>
      visibleCategories
        ? pois.filter((p) => visibleCategories.includes(p.categoryId) || p.id === extraVisiblePoiId)
        : pois,
    [pois, visibleCategories, extraVisiblePoiId],
  );

  // Not `new Map(...)` — see the comment on categoryById above; same shadowing trap.
  const poiById = useMemo(
    () => Object.fromEntries(visiblePois.map((p) => [p.id, p])) as Record<string, EventMapPoi>,
    [visiblePois],
  );

  const areaCategoryById = useMemo(
    () => Object.fromEntries(areaCategories.map((c) => [c.id, c])),
    [areaCategories],
  );

  const visibleAreas = useMemo(
    () =>
      visibleAreaCategoryIds
        ? areas.filter((a) => visibleAreaCategoryIds.includes(a.categoryId))
        : areas,
    [areas, visibleAreaCategoryIds],
  );

  const areaById = useMemo(
    () => Object.fromEntries(visibleAreas.map((a) => [a.id, a])) as Record<string, EventMapArea>,
    [visibleAreas],
  );

  const gridGeoJson = useMemo(() => gridCellsToGeoJSON(gridCells), [gridCells]);

  const highlightGeoJson = useMemo((): GeoJSON.Feature<GeoJSON.Polygon> | null => {
    if (!highlightedCell) return null;
    const ring = [...highlightedCell.corners.map((c) => [c.lng, c.lat]), [
      highlightedCell.corners[0].lng,
      highlightedCell.corners[0].lat,
    ]];
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  }, [highlightedCell]);

  const drawingGeoJson = useMemo((): GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Polygon> | null => {
    if (!drawingVertices || drawingVertices.length < 2) return null;
    const coords = drawingVertices.map((v) => [v.lng, v.lat]);
    if (drawingVertices.length >= 3) {
      return {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] },
      };
    }
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
  }, [drawingVertices]);

  return {
    categoryById,
    visiblePois,
    poiById,
    areaCategoryById,
    visibleAreas,
    areaById,
    gridGeoJson,
    highlightGeoJson,
    drawingGeoJson,
  };
}
