"use client";

import { useMemo } from "react";
import { computeGridCellsFromQuad, findGridCellInQuad, type LatLng } from "@/lib/geo";
import type { gridConfig } from "@/db/schema";

type GridRow = typeof gridConfig.$inferSelect;

/** Derives grid corner coordinates, computed cells, and (if a position is known) which cell
 * the visitor is currently standing in — from the raw grid config row. */
export function useGridData(grid: GridRow | null, userPosition: LatLng | null) {
  const gridCorners = useMemo(() => {
    if (!grid) return null;
    return {
      tl: { lat: grid.cornerTlLat, lng: grid.cornerTlLng },
      tr: { lat: grid.cornerTrLat, lng: grid.cornerTrLng },
      br: { lat: grid.cornerBrLat, lng: grid.cornerBrLng },
      bl: { lat: grid.cornerBlLat, lng: grid.cornerBlLng },
    };
  }, [grid]);

  const gridLabelOptions = useMemo(
    () =>
      grid
        ? {
            prefix: grid.labelPrefix,
            letterStart: grid.labelLetterStart,
            numberStart: grid.labelNumberStart,
            letterGroupSize: grid.labelLetterGroupSize,
          }
        : undefined,
    [grid],
  );

  const gridCells = useMemo(() => {
    if (!grid || !gridCorners) return [];
    return computeGridCellsFromQuad(
      gridCorners,
      grid.columns,
      grid.rows,
      grid.labelOrientation,
      gridLabelOptions,
    );
  }, [grid, gridCorners, gridLabelOptions]);

  const currentCell = useMemo(() => {
    if (!grid || !gridCorners || !userPosition) return null;
    return findGridCellInQuad(
      gridCorners,
      grid.columns,
      grid.rows,
      grid.labelOrientation,
      userPosition,
      gridLabelOptions,
    );
  }, [grid, gridCorners, userPosition, gridLabelOptions]);

  return { gridCorners, gridLabelOptions, gridCells, currentCell };
}
