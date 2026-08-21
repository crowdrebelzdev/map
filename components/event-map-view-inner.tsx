"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map,
  Source,
  Layer,
  Marker,
  GeolocateControl,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import type { FitBoundsOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X } from "lucide-react";
import type { CornerSet, GridCell, LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { getPoiIcon, getShapeContainerStyle } from "@/lib/poi-icons";
import { useMapLoadState } from "@/hooks/use-map-load-state";
import { useMapViewport } from "@/hooks/use-map-viewport";
import { useFlyToTarget } from "@/hooks/use-fly-to-target";
import { usePoiClustering, isClusterFeature } from "@/hooks/use-poi-clustering";
import { useVisibleMapData } from "@/hooks/use-visible-map-data";
import { useMapSelection } from "@/hooks/use-map-selection";
import type { PoiExtraFieldDef, PoiExtraFieldValue } from "@/db/schema";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const FALLBACK_CATEGORY_COLOR = "#64748b";
const POI_SIZE_PX: Record<string, number> = { small: 16, medium: 22, large: 30 };

const DETAIL_PANEL_CLASSNAME =
  "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border bg-background p-4 shadow-lg " +
  "sm:absolute sm:inset-x-auto sm:inset-y-auto sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:z-10 sm:w-80 sm:max-h-[calc(100%-1.5rem)] sm:rounded-lg sm:border sm:border-t";

export type EventMapPoiCategory = {
  id: string;
  label: string;
  color: string;
  icon: string | null;
  extraFields?: PoiExtraFieldDef[];
};

export type EventMapPoi = {
  id: string;
  name: string;
  description?: string | null;
  categoryId: string;
  lat: number;
  lng: number;
  size: string;
  /** Per-POI overrides — undefined/null falls back to the category's icon/color. */
  icon?: string | null;
  fillColor?: string | null;
  borderColor?: string | null;
  owner?: string | null;
  extraFieldValues?: PoiExtraFieldValue[];
};

export type EventMapLiveUser = {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  /** When this position was last reported — shown in the detail panel on tap. */
  updatedAt: Date;
  /** Which area this user currently falls inside, if any — computed by the caller. */
  areaLabel?: string | null;
};

export type EventMapAreaCategory = {
  id: string;
  label: string;
  color: string;
  extraFields?: PoiExtraFieldDef[];
};

export type EventMapArea = {
  id: string;
  name: string;
  categoryId: string;
  vertices: LatLng[];
  extraFieldValues?: PoiExtraFieldValue[];
};

export type EventMapImage = {
  imageUrl: string;
  /** A resized-down copy of `imageUrl`, safe to load as a single WebGL texture on any
   * device — see eventMap.displayImageUrl's schema comment. Used for the no-tiles fallback
   * `Source` below and for event-map-view.tsx's instant-preview placeholder; falls back to
   * `imageUrl` when absent (maps saved before this field existed). */
  displayImageUrl?: string | null;
  corners: { tl: LatLng; tr: LatLng; br: LatLng; bl: LatLng };
  /** Mirrors eventMap.lockOrientation (see db/schema.ts) — undefined/missing (older data
   * shapes) defaults to locked, same as the column's own default. */
  lockOrientation?: boolean;
  /** Mirrors eventMap.bearing (see db/schema.ts) — the compass heading the map opens at (and,
   * when lockOrientation is true, is held to). Undefined/missing defaults to 0 (north-up). */
  bearing?: number;
  /** Present once the plattegrond has a generated tile pyramid (see lib/map-tiling.ts) —
   * rendered instead of the single `imageUrl` overlay below when set, since it's the same
   * plattegrond at every zoom level without the multi-megabyte single-image download. Absent
   * (or the tiles not loading for some other reason) falls back to `imageUrl` exactly as
   * before — the two are never both absent, so the map is never left with nothing to show. */
  tiles?: { urlTemplate: string; minZoom: number; maxZoom: number; tileSize: number } | null;
};

/** A not-yet-saved POI, rendered with the exact same pill styling as a real marker so what
 * you see while filling in the "POI toevoegen" form is what you'll actually get. */
export type PreviewPoiMarker = {
  lat: number;
  lng: number;
  name: string;
  categoryId: string;
  icon?: string | null;
  fillColor?: string | null;
  borderColor?: string | null;
};

export type FlyToTarget =
  | { type: "bounds"; bounds: [[number, number], [number, number]] }
  | { type: "point"; center: LatLng; zoom?: number };

/** A `token` (not just the POI id) so a parent can re-trigger selecting the *same* POI a
 * second time in a row — e.g. clicking it again in a sidebar list after closing its panel —
 * without needing the id itself to change for the effect below to notice. */
export type PoiSelectSignal = { id: string; token: number };

export type EventMapViewProps = {
  mapImage: EventMapImage | null;
  gridCells?: GridCell[];
  gridLineColor?: string;
  gridLineWidth?: number;
  gridCasingColor?: string;
  gridCasingWidth?: number;
  /** The grid cell found via search — highlighted so it's unmistakable which one was meant. */
  highlightedCell?: GridCell | null;
  /** Enough to re-derive the same grid transform as `gridCells` — used to show which grid
   * cell a selected POI falls in, without recomputing the whole cell list. */
  gridTransformInput?: { corners: CornerSet; columns: number; rows: number };
  pois?: EventMapPoi[];
  categories?: EventMapPoiCategory[];
  visibleCategories?: string[];
  /** Shown regardless of `visibleCategories` — e.g. a POI a visitor searched for whose
   * category happens to be filtered off, so there's still something to select/see rather
   * than silently nothing. Only this one POI is exempted, not its whole category. */
  extraVisiblePoiId?: string | null;
  areas?: EventMapArea[];
  areaCategories?: EventMapAreaCategory[];
  visibleAreaCategoryIds?: string[];
  /** When provided, an area click calls this instead of opening the built-in detail popup —
   * same override pattern as onPoiClick. */
  onAreaClick?: (area: EventMapArea) => void;
  /** Non-null activates draw/edit mode: map clicks append a vertex, each existing vertex
   * becomes a draggable handle that can be clicked to remove it. */
  drawingVertices?: LatLng[] | null;
  onDrawingVertexAdd?: (latLng: LatLng) => void;
  onDrawingVertexDrag?: (index: number, latLng: LatLng) => void;
  onDrawingVertexRemove?: (index: number) => void;
  liveUsers?: EventMapLiveUser[];
  geolocate?: boolean;
  onMapClick?: (latLng: LatLng) => void;
  /** When provided, a POI-marker click calls this instead of opening the built-in detail popup —
   * used by the admin workspace's edit mode to route the click into the sidebar form instead. */
  onPoiClick?: (poi: EventMapPoi) => void;
  /** Lets a parent open the built-in read-only detail panel for a specific POI — as if its
   * marker had been clicked directly on the map — e.g. from a sidebar list row. */
  externalSelectPoi?: PoiSelectSignal | null;
  /** Fires whenever the selected POI changes for any reason — a direct marker tap, the map
   * background being clicked (clearing it back to null), the panel's own close button, or
   * `externalSelectPoi` above — so a parent can react to the selection being cleared again,
   * not just set it. */
  onSelectedPoiIdChange?: (poiId: string | null) => void;
  /** A single flag for "all POIs draggable", or a predicate to allow it per-POI — used to
   * restrict dragging to whichever category the admin has focused for editing. */
  draggablePois?: boolean | ((poi: EventMapPoi) => boolean);
  onPoiDragEnd?: (poiId: string, latLng: LatLng) => void;
  /** Multiplies every POI marker's base pixel size — a viewer-controlled "make everything
   * bigger/smaller at once" knob, independent of each POI's own small/medium/large setting. */
  poiSizeMultiplier?: number;
  previewMarker?: PreviewPoiMarker | null;
  /** The user's current (real or manually simulated) position — rendered as a prominent marker above everything else. */
  userLocation?: LatLng | null;
  flyToTarget?: FlyToTarget | null;
  className?: string;
  /** Fires once, the first time the map goes idle after loading (style ready *and* every
   * source — including this event's plattegrond overlay — has finished loading its
   * tiles/image, not just the style itself). Lets a parent swap away a static loading
   * placeholder without a flash of the basemap showing through before the plattegrond has
   * actually painted. */
  onMapReady?: () => void;
};

/** The pill-shaped icon+name marker shared by real POI markers and the live create-POI
 * preview — kept as one component so the preview is pixel-identical to the real thing. */
function PoiPill({
  name,
  Icon,
  pillColor,
  borderColor,
  sizePx,
  draft,
}: {
  name: string;
  Icon: ReturnType<typeof getPoiIcon>;
  pillColor: string;
  borderColor?: string | null;
  sizePx: number;
  /** Not yet saved — rendered slightly translucent with a dashed outline so it reads as a
   * preview rather than a committed POI. */
  draft?: boolean;
}) {
  const iconSize = Math.round(sizePx * 0.55);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Icon ? Math.round(sizePx * 0.25) : 0,
        background: pillColor,
        border: borderColor
          ? `2px ${draft ? "dashed" : "solid"} ${borderColor}`
          : `2px ${draft ? "dashed" : "solid"} rgba(255,255,255,0.85)`,
        borderRadius: 999,
        padding: Icon ? `4px ${Math.round(sizePx * 0.35)}px 4px 6px` : `4px ${Math.round(sizePx * 0.35)}px`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        opacity: draft ? 0.9 : 1,
      }}
    >
      {Icon && <Icon className="text-white" style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />}
      <span
        style={{
          fontSize: Math.max(11, Math.round(sizePx * 0.5)),
          fontWeight: 700,
          color: "white",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function cornersToBounds(corners: EventMapImage["corners"]) {
  const lats = [corners.tl.lat, corners.tr.lat, corners.br.lat, corners.bl.lat];
  const lngs = [corners.tl.lng, corners.tr.lng, corners.br.lng, corners.bl.lng];
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ] as [[number, number], [number, number]];
}

export default function EventMapView({
  mapImage,
  gridCells = [],
  gridLineColor = "#111827",
  gridLineWidth = 3,
  gridCasingColor = "#ffffff",
  gridCasingWidth = 2,
  highlightedCell,
  gridTransformInput,
  pois = [],
  categories = [],
  visibleCategories,
  extraVisiblePoiId,
  areas = [],
  areaCategories = [],
  visibleAreaCategoryIds,
  onAreaClick,
  drawingVertices,
  onDrawingVertexAdd,
  onDrawingVertexDrag,
  onDrawingVertexRemove,
  liveUsers = [],
  geolocate = false,
  onMapClick,
  onPoiClick,
  externalSelectPoi,
  onSelectedPoiIdChange,
  draggablePois = false,
  onPoiDragEnd,
  poiSizeMultiplier = 1,
  previewMarker,
  userLocation,
  flyToTarget,
  className,
  onMapReady,
}: EventMapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const { loaded, handleMapLoad, handleMapSourceData } = useMapLoadState(mapRef, mapImage, onMapReady);
  const viewport = useMapViewport(mapRef, loaded);
  const lockOrientation = mapImage?.lockOrientation ?? true;
  const bearing = mapImage?.bearing ?? 0;

  // See the identical effect in image-overlay-editor-inner.tsx for why touchZoomRotate/keyboard
  // are driven imperatively instead of via a react-map-gl prop (both are whole-handler toggles
  // there, and disabling either fully would take touch pinch-zoom / keyboard pan down with it).
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (lockOrientation) {
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } else {
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
    }
  }, [loaded, lockOrientation]);
  useFlyToTarget(mapRef, loaded, flyToTarget);

  const {
    categoryById,
    visiblePois,
    poiById,
    areaCategoryById,
    visibleAreas,
    areaById,
    gridGeoJson,
    highlightGeoJson,
    drawingGeoJson,
  } = useVisibleMapData({
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
  });

  const { clusterIndex, clusterItems } = usePoiClustering(visiblePois, viewport);

  const {
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
  } = useMapSelection({
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
  });

  const [selectedLiveUserId, setSelectedLiveUserId] = useState<string | null>(null);
  const selectedLiveUser = selectedLiveUserId ? liveUsers.find((u) => u.userId === selectedLiveUserId) ?? null : null;

  const initialBounds = mapImage ? cornersToBounds(mapImage.corners) : undefined;

  function handleClick(e: MapLayerMouseEvent) {
    const latLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };

    if (drawingVertices) {
      onDrawingVertexAdd?.(latLng);
      return;
    }

    // Whichever "layer" the caller has made active (i.e. it's handling map clicks at all)
    // is authoritative — a click always does that, even if it happens to land on top of an
    // area shape. Only when nothing owns plain map clicks do we fall back to the read-only
    // area-select/detail-panel behavior below.
    if (onMapClick) {
      setSelectedPoiId(null);
      setSelectedAreaId(null);
      setSelectedLiveUserId(null);
      onMapClick(latLng);
      return;
    }

    const areaFeature = e.features?.find((f) => f.layer.id === "map-areas-fill-layer");
    const areaId = areaFeature?.properties?.areaId as string | undefined;
    const area = areaId ? areaById[areaId] : undefined;
    if (area) {
      if (onAreaClick) {
        onAreaClick(area);
      } else {
        setSelectedPoiId(null);
        setSelectedLiveUserId(null);
        setSelectedAreaId(area.id);
      }
      return;
    }

    // A click on empty map is also how the focus-dim from a prior selection gets cleared —
    // everything else "comes back" as soon as you click anywhere on the map background.
    setSelectedPoiId(null);
    setSelectedAreaId(null);
    setSelectedLiveUserId(null);
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
    <Map
      ref={mapRef}
      mapStyle={BASEMAP_STYLE}
      initialViewState={
        initialBounds
          ? {
              bounds: initialBounds,
              // MapLibre's own cameraForBounds defaults bearing to 0 when it's not inside
              // *these* options specifically — a top-level `bearing` alongside `bounds` gets
              // applied first (via jumpTo) and then immediately clobbered back to 0 by the
              // fitBounds call bounds triggers, so it has to live here instead. react-map-gl's
              // fitBoundsOptions type is narrower than MapLibre's real (and honored) one, hence
              // the cast.
              fitBoundsOptions: { padding: 40, bearing } as FitBoundsOptions,
            }
          : { longitude: 5.2913, latitude: 52.1326, zoom: 6, bearing }
      }
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
      interactiveLayerIds={["map-areas-fill-layer"]}
      cursor={onMapClick || drawingVertices ? "crosshair" : "grab"}
      onLoad={handleMapLoad}
      onSourceData={handleMapSourceData}
      dragRotate={!lockOrientation}
      maxPitch={lockOrientation ? 0 : undefined}
      // Required by OpenStreetMap's ODbL license and OpenFreeMap's terms — can't be removed,
      // but `compact` collapses it to a small "i" icon instead of the full credit line.
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={!lockOrientation} />
      {geolocate && (
        <GeolocateControl
          position="bottom-right"
          trackUserLocation
          showAccuracyCircle
          positionOptions={{ enableHighAccuracy: true }}
        />
      )}

      {loaded && mapImage && mapImage.tiles && (
        <Source
          id="event-map-tiles"
          type="raster"
          tiles={[mapImage.tiles.urlTemplate]}
          // The size *this specific tile set* was actually generated at (see
          // eventMap.tileSize's schema comment) — not DEFAULT_TILE_SIZE, which only governs
          // *new* generations and can change over time without invalidating tiles already
          // rendered under a different size.
          tileSize={mapImage.tiles.tileSize}
          minzoom={mapImage.tiles.minZoom}
          maxzoom={mapImage.tiles.maxZoom}
          bounds={cornersToBounds(mapImage.corners).flat() as [number, number, number, number]}
        >
          <Layer id="event-map-tiles-layer" type="raster" paint={{ "raster-opacity": 1 }} />
        </Source>
      )}

      {loaded && mapImage && !mapImage.tiles && (
        <Source
          id="event-map-image"
          type="image"
          // The (capped) display copy, not the full-resolution `imageUrl` — loading this as
          // one WebGL texture can exceed the max texture size on mobile GPUs otherwise. See
          // eventMap.displayImageUrl's schema comment. Falls back to `imageUrl` for maps
          // saved before that field existed.
          url={mapImage.displayImageUrl ?? mapImage.imageUrl}
          coordinates={[
            [mapImage.corners.tl.lng, mapImage.corners.tl.lat],
            [mapImage.corners.tr.lng, mapImage.corners.tr.lat],
            [mapImage.corners.br.lng, mapImage.corners.br.lat],
            [mapImage.corners.bl.lng, mapImage.corners.bl.lat],
          ]}
        >
          <Layer id="event-map-image-layer" type="raster" paint={{ "raster-opacity": 1 }} />
        </Source>
      )}

      {loaded && gridCells.length > 0 && (
        <Source id="grid-lines" type="geojson" data={gridGeoJson.lines}>
          {/* Configurable casing under the line so the grid stays legible against any
              basemap/plattegrond detail, especially when zoomed in close. Set casing
              width to 0 to hide it entirely. */}
          {gridCasingWidth > 0 && (
            <Layer
              id="grid-lines-casing-layer"
              type="line"
              paint={{
                "line-color": gridCasingColor,
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  10,
                  (gridLineWidth + gridCasingWidth * 2) * 0.5,
                  16,
                  gridLineWidth + gridCasingWidth * 2,
                  20,
                  (gridLineWidth + gridCasingWidth * 2) * 1.5,
                ],
                "line-opacity": 0.9,
              }}
            />
          )}
          <Layer
            id="grid-lines-layer"
            type="line"
            paint={{
              "line-color": gridLineColor,
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                gridLineWidth * 0.5,
                16,
                gridLineWidth,
                20,
                gridLineWidth * 1.5,
              ],
              "line-opacity": 1,
            }}
          />
        </Source>
      )}

      {/* Labels are dropped at low zoom on purpose: with hundreds of cells they'd overlap into
          unreadable clutter and visually bury the grid lines. They fade in once zoomed in enough
          to actually read them (e.g. after a grid-code search flies the user in). */}
      {loaded && gridCells.length > 0 && (
        <Source id="grid-labels" type="geojson" data={gridGeoJson.labels}>
          <Layer
            id="grid-labels-layer"
            type="symbol"
            minzoom={15}
            layout={{
              "text-field": ["get", "code"],
              "text-size": 13,
              "text-font": ["Noto Sans Bold"],
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#111827",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            }}
          />
        </Source>
      )}

      {loaded && highlightGeoJson && (
        <Source id="highlighted-cell" type="geojson" data={highlightGeoJson}>
          <Layer
            id="highlighted-cell-fill-layer"
            type="fill"
            paint={{ "fill-color": "#3b82f6", "fill-opacity": 0.35 }}
          />
          <Layer
            id="highlighted-cell-outline-layer"
            type="line"
            paint={{ "line-color": "#3b82f6", "line-width": 3, "line-opacity": 1 }}
          />
        </Source>
      )}

      {loaded && areasGeoJson.features.length > 0 && (
        <Source id="map-areas" type="geojson" data={areasGeoJson}>
          <Layer
            id="map-areas-fill-layer"
            type="fill"
            paint={{
              "fill-color": ["get", "color"],
              "fill-opacity": ["case", ["get", "dimmed"], 0.08, 0.25],
            }}
          />
          <Layer
            id="map-areas-outline-layer"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 2,
              "line-opacity": ["case", ["get", "dimmed"], 0.3, 0.9],
            }}
          />
        </Source>
      )}

      {loaded && drawingGeoJson && (
        <Source id="drawing-area" type="geojson" data={drawingGeoJson}>
          <Layer
            id="drawing-area-fill-layer"
            type="fill"
            paint={{ "fill-color": "#111827", "fill-opacity": 0.15 }}
          />
          <Layer
            id="drawing-area-line-layer"
            type="line"
            paint={{ "line-color": "#111827", "line-width": 2, "line-dasharray": [2, 1] }}
          />
        </Source>
      )}

      {drawingVertices?.map((v, i) => (
        <Marker
          key={i}
          longitude={v.lng}
          latitude={v.lat}
          anchor="center"
          draggable
          onDrag={(e) => onDrawingVertexDrag?.(i, { lat: e.lngLat.lat, lng: e.lngLat.lng })}
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onDrawingVertexRemove?.(i);
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: i === 0 ? "#16a34a" : "#111827",
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              cursor: "grab",
            }}
          />
        </Marker>
      ))}

      {clusterItems.map((item) => {
        const [lng, lat] = item.geometry.coordinates;

        if (isClusterFeature(item)) {
          const clusterId = item.properties.cluster_id;
          const count = item.properties.point_count;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              longitude={lng}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                // Marker clicks bubble up to the map's own click handler (maplibre listens on
                // the shared canvas container that markers are children of) — without this,
                // a cluster click would also register as a map click and start a new POI.
                e.originalEvent.stopPropagation();
                const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 20);
                mapRef.current?.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#111827",
                  color: "white",
                  border: "2px solid white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {count}
              </div>
            </Marker>
          );
        }

        const p = poiById[item.properties.poiId];
        if (!p) return null;
        const cat = categoryById[p.categoryId];
        const Icon = getPoiIcon(p.icon ?? cat?.icon);
        // Every POI now renders at the same base size — the viewer's own size control
        // (poiSizeMultiplier) is the only thing that scales markers, not an admin-set value.
        const sizePx = POI_SIZE_PX.medium * poiSizeMultiplier;
        const pillColor = p.fillColor ?? cat?.color ?? FALLBACK_CATEGORY_COLOR;
        const isDimmed = Boolean(selectedPoiId || selectedAreaId) && p.id !== selectedPoiId;
        const isDraggable = typeof draggablePois === "function" ? draggablePois(p) : draggablePois;

        return (
          <Marker
            key={p.id}
            longitude={p.lng}
            latitude={p.lat}
            anchor="bottom"
            draggable={isDraggable}
            onDragEnd={
              isDraggable
                ? (e) => onPoiDragEnd?.(p.id, { lat: e.lngLat.lat, lng: e.lngLat.lng })
                : undefined
            }
            onClick={(e) => {
              // See the cluster marker's onClick above — same bubbling gotcha applies here.
              e.originalEvent.stopPropagation();
              if (onPoiClick) {
                onPoiClick(p);
              } else {
                setSelectedAreaId(null);
                setSelectedLiveUserId(null);
                setSelectedPoiId(p.id);
              }
            }}
          >
            <div
              title={`${p.name}${cat ? ` (${cat.label})` : ""}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: isDraggable ? "grab" : "pointer",
                opacity: isDimmed ? 0.35 : 1,
                transition: "opacity 150ms ease",
              }}
            >
              <PoiPill name={p.name} Icon={Icon} pillColor={pillColor} borderColor={p.borderColor} sizePx={sizePx} />
              {/* Part of normal flow (not absolutely positioned) so the marker's own
                  bounding box includes it — MapLibre's anchor="bottom" translates by
                  -100% of that box, so this tip is what actually lands on lat/lng. An
                  overlaid tail would look identical but drift from the true anchor as
                  the underlying map scales with zoom. */}
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `6px solid ${pillColor}`,
                }}
              />
            </div>
          </Marker>
        );
      })}

      {liveUsers.map((u) => (
        <Marker
          key={u.userId}
          longitude={u.lng}
          latitude={u.lat}
          anchor="bottom"
          onClick={(e) => {
            // See the cluster marker's onClick above — same bubbling gotcha applies here.
            e.originalEvent.stopPropagation();
            setSelectedPoiId(null);
            setSelectedAreaId(null);
            setSelectedLiveUserId(u.userId);
          }}
        >
          <div
            title={u.userName}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "white",
                background: "#111827",
                borderRadius: 4,
                padding: "1px 5px",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              {u.userName}
            </span>
            {u.areaLabel && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#111827",
                  background: "white",
                  borderRadius: 4,
                  padding: "1px 5px",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
              >
                in {u.areaLabel}
              </span>
            )}
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#f59e0b",
                border: "2px solid white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            />
          </div>
        </Marker>
      ))}

      {previewMarker && (() => {
        const cat = categoryById[previewMarker.categoryId];
        const Icon = getPoiIcon(previewMarker.icon ?? cat?.icon);
        const sizePx = POI_SIZE_PX.medium * poiSizeMultiplier;
        const pillColor = previewMarker.fillColor ?? cat?.color ?? FALLBACK_CATEGORY_COLOR;
        const name = previewMarker.name.trim() || cat?.label || "Nieuwe POI";
        return (
          <Marker longitude={previewMarker.lng} latitude={previewMarker.lat} anchor="bottom">
            <div title={`${name} (voorbeeld)`} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <PoiPill
                name={name}
                Icon={Icon}
                pillColor={pillColor}
                borderColor={previewMarker.borderColor}
                sizePx={sizePx}
                draft
              />
              <div
                style={{
                  width: 0,
                  height: 0,
                  opacity: 0.9,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `6px solid ${pillColor}`,
                }}
              />
            </div>
          </Marker>
        );
      })()}

      {userLocation && (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
          <div
            style={{
              position: "relative",
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="gps-marker-pulse" />
            <div
              style={{
                position: "relative",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#2563eb",
                border: "3px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
              }}
            />
          </div>
        </Marker>
      )}
    </Map>
    {selectedPoi && (
      <div className={DETAIL_PANEL_CLASSNAME}>
        <button
          type="button"
          onClick={() => setSelectedPoiId(null)}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Sluiten</span>
        </button>
        <div className="pr-8">
          <div className="flex items-start gap-2">
            {(() => {
              const Icon = getPoiIcon(selectedPoi.icon ?? selectedCategory?.icon);
              return (
                <div
                  className="shrink-0"
                  style={getShapeContainerStyle(
                    "circle",
                    selectedPoi.fillColor ?? selectedCategory?.color ?? FALLBACK_CATEGORY_COLOR,
                    22,
                  )}
                >
                  {Icon && <Icon className="text-white" style={{ width: 12, height: 12 }} />}
                </div>
              );
            })()}
            <div className="min-w-0">
              <p className="break-words font-semibold">{selectedPoi.name}</p>
              {selectedCategory && (
                <p className="truncate text-xs text-muted-foreground">{selectedCategory.label}</p>
              )}
            </div>
          </div>
          {selectedPoiGridCell && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              GRID: <span className="font-mono text-foreground">{selectedPoiGridCell.code}</span>
            </p>
          )}
          {selectedPoi.owner && (
            <p className="mt-1 text-xs text-muted-foreground">Eigenaar: {selectedPoi.owner}</p>
          )}
          {selectedPoi.description && (
            <p className="mt-3 text-sm text-muted-foreground">{selectedPoi.description}</p>
          )}
          {selectedPoi.extraFieldValues && selectedPoi.extraFieldValues.length > 0 && (
            <dl className="mt-3 space-y-1.5 border-t pt-3">
              {selectedPoi.extraFieldValues.map((row) => (
                <div key={row.key}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    )}
    {selectedArea && (
      <div className={DETAIL_PANEL_CLASSNAME}>
        <button
          type="button"
          onClick={() => setSelectedAreaId(null)}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Sluiten</span>
        </button>
        <div className="pr-8">
          <div className="flex items-center gap-2">
            <span
              className="size-4 shrink-0 rounded-sm border border-white shadow"
              style={{ background: selectedAreaCategory?.color ?? FALLBACK_CATEGORY_COLOR }}
            />
            <div className="min-w-0">
              <p className="truncate font-semibold">{selectedArea.name}</p>
              {selectedAreaCategory && (
                <p className="truncate text-xs text-muted-foreground">{selectedAreaCategory.label}</p>
              )}
            </div>
          </div>
          {selectedAreaGridCells.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground">GRID:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedAreaGridCells.map((c) => {
                  const overlapping = otherAreasByGridCell[c.code] ?? [];
                  return (
                    <span
                      key={c.code}
                      className="inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-foreground"
                      title={
                        overlapping.length > 0
                          ? `Ook in: ${overlapping.map((a) => a.name).join(", ")}`
                          : undefined
                      }
                    >
                      {c.code}
                      {overlapping.length > 0 && (
                        <span className="rounded-full bg-amber-200 px-1 font-sans text-[10px] font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                          {overlapping.length}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {selectedArea.extraFieldValues && selectedArea.extraFieldValues.length > 0 && (
            <dl className="mt-3 space-y-1.5 border-t pt-3">
              {selectedArea.extraFieldValues.map((row) => (
                <div key={row.key}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {selectedAreaPois.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                POI&apos;s in dit gebied ({selectedAreaPois.length})
              </p>
              <ul className="space-y-1">
                {selectedAreaPois.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5 text-sm">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: p.fillColor ?? categoryById[p.categoryId]?.color ?? FALLBACK_CATEGORY_COLOR }}
                    />
                    <span className="truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )}
    {selectedLiveUser && (
      <div className={DETAIL_PANEL_CLASSNAME}>
        <button
          type="button"
          onClick={() => setSelectedLiveUserId(null)}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
          <span className="sr-only">Sluiten</span>
        </button>
        <div className="pr-8">
          <p className="break-words font-semibold">{selectedLiveUser.userName}</p>
          {selectedLiveUser.areaLabel && (
            <p className="truncate text-xs text-muted-foreground">{selectedLiveUser.areaLabel}</p>
          )}
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Laatst binnengehaald om{" "}
            <span className="font-mono text-foreground">
              {selectedLiveUser.updatedAt.toLocaleTimeString("nl-NL", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </p>
        </div>
      </div>
    )}
    </div>
  );
}
