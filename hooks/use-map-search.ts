"use client";

import { useMemo, useState } from "react";
import { logSearch } from "@/actions/search-log";
import { distanceMeters, parseGridCode, type GridCell, type GridLabelOptions, type LatLng } from "@/lib/geo";
import type { FlyToTarget, PoiSelectSignal } from "@/components/event-map-view";
import type { gridConfig, poi } from "@/db/schema";

type GridRow = typeof gridConfig.$inferSelect;
type PoiRow = typeof poi.$inferSelect;

/** Grid-code / POI search for the operational map: matching, flying the map to a result, and
 * (for a POI outside the current category filter) revealing just that one POI as a temporary
 * exception — see `extraVisiblePoiId` on `EventMapView`. Also owns the "fly to X" signal and
 * the external POI-selection signal, since both are only ever triggered from here. */
export function useMapSearch(opts: {
  eventId: string;
  isStaff: boolean;
  grid: GridRow | null;
  gridCells: GridCell[];
  gridLabelOptions: GridLabelOptions | undefined;
  visiblePois: PoiRow[];
  visibleCategories: string[];
  userPosition: LatLng | null;
}) {
  const { eventId, isStaff, grid, gridCells, gridLabelOptions, visiblePois, visibleCategories, userPosition } = opts;

  const [query, setQuery] = useState("");
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [selectPoiSignal, setSelectPoiSignal] = useState<PoiSelectSignal | null>(null);
  // A POI search surfaced from a category that's currently filtered off — shown as a single
  // exception (not its whole category) for as long as it's selected, see selectPoi and
  // handleSelectedPoiIdChange below.
  const [tempRevealedPoiId, setTempRevealedPoiId] = useState<string | null>(null);
  const [highlightedCell, setHighlightedCell] = useState<GridCell | null>(null);

  const gridMatch = useMemo(() => {
    if (!query.trim() || gridCells.length === 0 || !grid) return null;
    const parsed = parseGridCode(query, grid.labelOrientation, gridLabelOptions);
    if (!parsed) return null;
    return gridCells.find((c) => c.col === parsed.col && c.row === parsed.row) ?? null;
  }, [query, gridCells, grid, gridLabelOptions]);

  const poiMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const matches = visiblePois.filter((p) => p.name.toLowerCase().includes(q));
    // Closest-first when we know where the user is — falls back to source order (as before)
    // once no position is available yet (GPS still starting up, permission denied, etc.).
    if (userPosition) {
      matches.sort((a, b) => distanceMeters(userPosition, a) - distanceMeters(userPosition, b));
    }
    return matches.slice(0, 6);
  }, [query, visiblePois, userPosition]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setHighlightedCell(null);
  }

  function handleSelectedPoiIdChange(poiId: string | null) {
    // Selection cleared (panel closed, or the map background was tapped) — the single-POI
    // exception from selectPoi below, if any, no longer applies.
    if (poiId === null) setTempRevealedPoiId(null);
  }

  function selectGridCell() {
    if (!gridMatch) return;
    setFlyToTarget({
      type: "bounds",
      bounds: [
        [gridMatch.latLngBounds.sw.lng, gridMatch.latLngBounds.sw.lat],
        [gridMatch.latLngBounds.ne.lng, gridMatch.latLngBounds.ne.lat],
      ],
    });
    setHighlightedCell(gridMatch);
    setQuery("");
    if (isStaff) logSearch(eventId, "grid", gridMatch.code).catch(() => {});
  }

  function selectPoi(p: PoiRow) {
    setFlyToTarget({ type: "point", center: { lat: p.lat, lng: p.lng }, zoom: 19 });
    // Search can surface a POI whose category is currently filtered off — show just this
    // one POI as an exception (not its whole category) so there's something to select, via
    // extraVisiblePoiId below; cleared again once the selection clears.
    setTempRevealedPoiId(!visibleCategories.includes(p.categoryId) ? p.id : null);
    // Opens the same detail panel a direct marker tap would, and — since the map dims every
    // other POI while one is selected — puts this one in the spotlight until the visitor
    // taps elsewhere on the map to clear the selection again.
    setSelectPoiSignal({ id: p.id, token: Date.now() });
    setHighlightedCell(null);
    setQuery("");
    if (isStaff) logSearch(eventId, "poi", p.name).catch(() => {});
  }

  return {
    query,
    handleQueryChange,
    flyToTarget,
    selectPoiSignal,
    tempRevealedPoiId,
    highlightedCell,
    gridMatch,
    poiMatches,
    handleSelectedPoiIdChange,
    selectGridCell,
    selectPoi,
  };
}
