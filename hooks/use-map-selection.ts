"use client";

import { useEffect, useMemo, useState } from "react";
import type { CornerSet, GridCell } from "@/lib/geo";
import { computeTransform, isPointInPolygon, latLngToPixel, polygonsIntersect } from "@/lib/geo";
import type {
  EventMapArea,
  EventMapAreaCategory,
  EventMapPoi,
  EventMapPoiCategory,
  PoiSelectSignal,
} from "@/components/event-map-view-inner";

const FALLBACK_CATEGORY_COLOR = "#64748b";

/** The selected-POI/selected-area state and everything derived from it — the read-only
 * detail panels' data, the grid cell(s) a selection falls in, and `areasGeoJson` (which
 * needs `selectedPoiId`/`selectedAreaId` for its `dimmed` flag, so it lives here rather
 * than in `useVisibleMapData`). Consumes that hook's output. */
export function useMapSelection({
  externalSelectPoi,
  onSelectedPoiIdChange,
  poiById,
  categoryById,
  areaById,
  areaCategoryById,
  visiblePois,
  visibleAreas,
  gridCells,
  gridTransformInput,
}: {
  externalSelectPoi: PoiSelectSignal | null | undefined;
  onSelectedPoiIdChange: ((poiId: string | null) => void) | undefined;
  poiById: Record<string, EventMapPoi>;
  categoryById: Record<string, EventMapPoiCategory>;
  areaById: Record<string, EventMapArea>;
  areaCategoryById: Record<string, EventMapAreaCategory>;
  visiblePois: EventMapPoi[];
  visibleAreas: EventMapArea[];
  gridCells: GridCell[];
  gridTransformInput: { corners: CornerSet; columns: number; rows: number } | undefined;
}) {
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  // Lets a parent (e.g. a sidebar POI list) open the same read-only panel a direct marker
  // click would — the `token` in the signal guarantees this fires even when re-selecting
  // the POI that's already selected. Synchronizing to an external signal like this is
  // exactly what Effects are for; it isn't the reset-on-prop-change pattern the lint rule
  // is meant to catch, so this stays an Effect rather than a key-remount.
  useEffect(() => {
    if (!externalSelectPoi) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPoiId(externalSelectPoi.id);
    setSelectedAreaId(null);
  }, [externalSelectPoi]);

  useEffect(() => {
    onSelectedPoiIdChange?.(selectedPoiId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoiId]);

  const selectedPoi = selectedPoiId ? poiById[selectedPoiId] : null;
  const selectedCategory = selectedPoi ? categoryById[selectedPoi.categoryId] : undefined;

  const gridTransform = useMemo(
    () =>
      gridTransformInput
        ? computeTransform(gridTransformInput.columns, gridTransformInput.rows, gridTransformInput.corners)
        : null,
    [gridTransformInput],
  );

  const selectedPoiGridCell = useMemo(() => {
    if (!selectedPoi || !gridTransform) return null;
    const px = latLngToPixel(gridTransform, { lat: selectedPoi.lat, lng: selectedPoi.lng });
    const col = Math.floor(px.x);
    const row = Math.floor(px.y);
    return gridCells.find((c) => c.col === col && c.row === row) ?? null;
  }, [selectedPoi, gridTransform, gridCells]);

  const selectedArea = selectedAreaId ? areaById[selectedAreaId] : null;
  const selectedAreaCategory = selectedArea ? areaCategoryById[selectedArea.categoryId] : undefined;

  const selectedAreaGridCells = useMemo(() => {
    if (!selectedArea || gridCells.length === 0) return [];
    // Any overlap counts, not just cells whose center falls inside — an area that only
    // clips a cell's corner should still list that cell.
    return gridCells.filter((c) => polygonsIntersect(c.corners, selectedArea.vertices));
  }, [selectedArea, gridCells]);

  // Which other visible areas also cover each of the selected area's grid cells — surfaced
  // as a small badge so overlapping sectors (e.g. a parking area sharing cells with a
  // security zone) are visible without cross-referencing every area's own cell list by hand.
  const otherAreasByGridCell = useMemo(() => {
    const result: Record<string, EventMapArea[]> = {};
    if (!selectedArea || selectedAreaGridCells.length === 0 || visibleAreas.length <= 1) return result;
    const otherAreas = visibleAreas.filter((a) => a.id !== selectedArea.id);
    for (const cell of selectedAreaGridCells) {
      const overlapping = otherAreas.filter((a) => polygonsIntersect(cell.corners, a.vertices));
      if (overlapping.length > 0) result[cell.code] = overlapping;
    }
    return result;
  }, [selectedArea, selectedAreaGridCells, visibleAreas]);

  const selectedAreaPois = useMemo(() => {
    if (!selectedArea) return [];
    return visiblePois.filter((p) => isPointInPolygon({ lat: p.lat, lng: p.lng }, selectedArea.vertices));
  }, [selectedArea, visiblePois]);

  const areasGeoJson = useMemo((): GeoJSON.FeatureCollection<GeoJSON.Polygon> => {
    const focused = Boolean(selectedPoiId || selectedAreaId);
    return {
      type: "FeatureCollection",
      features: visibleAreas.map((a) => ({
        type: "Feature",
        properties: {
          areaId: a.id,
          color: areaCategoryById[a.categoryId]?.color ?? FALLBACK_CATEGORY_COLOR,
          dimmed: focused && a.id !== selectedAreaId,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[...a.vertices.map((v) => [v.lng, v.lat]), [a.vertices[0]?.lng ?? 0, a.vertices[0]?.lat ?? 0]]],
        },
      })),
    };
  }, [visibleAreas, areaCategoryById, selectedPoiId, selectedAreaId]);

  return {
    selectedPoiId,
    setSelectedPoiId,
    selectedAreaId,
    setSelectedAreaId,
    selectedPoi,
    selectedCategory,
    selectedPoiGridCell,
    selectedArea,
    selectedAreaCategory,
    selectedAreaGridCells,
    otherAreasByGridCell,
    selectedAreaPois,
    areasGeoJson,
  };
}
