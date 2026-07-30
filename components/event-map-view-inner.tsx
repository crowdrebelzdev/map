"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster, { type ClusterFeature, type PointFeature } from "supercluster";
import { X } from "lucide-react";
import type { CornerSet, GridCell, LatLng } from "@/lib/geo";
import { computeTransform, gridCellsToGeoJSON, isPointInPolygon, latLngToPixel, polygonsIntersect } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { getPoiIcon, getShapeContainerStyle } from "@/lib/poi-icons";
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

type PoiPointProps = { poiId: string };
type PoiClusterProps = Record<string, never>;

function isClusterFeature(
  item: ClusterFeature<PoiClusterProps> | PointFeature<PoiPointProps>,
): item is ClusterFeature<PoiClusterProps> {
  return "cluster" in item.properties && item.properties.cluster === true;
}

export type EventMapLiveUser = {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
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
  corners: { tl: LatLng; tr: LatLng; br: LatLng; bl: LatLng };
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
  draggablePois = false,
  onPoiDragEnd,
  poiSizeMultiplier = 1,
  previewMarker,
  userLocation,
  flyToTarget,
  className,
}: EventMapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ zoom: number; bounds: [number, number, number, number] } | null>(
    null,
  );

  // Lets a parent (e.g. a sidebar POI list) open the same read-only panel a direct marker
  // click would — the `token` in the signal guarantees this fires even when re-selecting
  // the POI that's already selected.
  useEffect(() => {
    if (!externalSelectPoi) return;
    setSelectedPoiId(externalSelectPoi.id);
    setSelectedAreaId(null);
  }, [externalSelectPoi]);

  // Tracked for POI clustering + zoom-gated labels — recomputed on every pan/zoom so
  // clusters stay in sync with what's actually on screen.
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
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !flyToTarget || !mapRef.current) return;
    if (flyToTarget.type === "bounds") {
      mapRef.current.fitBounds(flyToTarget.bounds, { padding: 60, duration: 800 });
    } else {
      mapRef.current.flyTo({
        center: [flyToTarget.center.lng, flyToTarget.center.lat],
        zoom: flyToTarget.zoom ?? 19,
        duration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToTarget, loaded]);

  const gridGeoJson = useMemo(() => gridCellsToGeoJSON(gridCells), [gridCells]);

  const highlightGeoJson = useMemo(():
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null => {
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

  // Not `new Map(...)` — this file imports `Map` from react-map-gl for the map component,
  // which shadows the built-in Map constructor.
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const visiblePois = useMemo(
    () =>
      visibleCategories
        ? pois.filter((p) => visibleCategories.includes(p.categoryId))
        : pois,
    [pois, visibleCategories],
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
        setSelectedAreaId(area.id);
      }
      return;
    }

    // A click on empty map is also how the focus-dim from a prior selection gets cleared —
    // everything else "comes back" as soon as you click anywhere on the map background.
    setSelectedPoiId(null);
    setSelectedAreaId(null);
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
    <Map
      ref={mapRef}
      mapStyle={BASEMAP_STYLE}
      initialViewState={
        initialBounds
          ? { bounds: initialBounds, fitBoundsOptions: { padding: 40 } }
          : { longitude: 5.2913, latitude: 52.1326, zoom: 6 }
      }
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
      interactiveLayerIds={["map-areas-fill-layer"]}
      cursor={onMapClick || drawingVertices ? "crosshair" : "grab"}
      onLoad={() => {
        setLoaded(true);
        // MapLibre's compact attribution briefly shows the full credit line on first
        // load before collapsing to just the icon on the next drag — collapse it
        // immediately instead so it never flashes the full text at all.
        mapRef.current
          ?.getMap()
          .getContainer()
          .querySelector(".maplibregl-ctrl-attrib")
          ?.classList.remove("maplibregl-compact-show");
      }}
      // Required by OpenStreetMap's ODbL license and OpenFreeMap's terms — can't be removed,
      // but `compact` collapses it to a small "i" icon instead of the full credit line.
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" />
      {geolocate && (
        <GeolocateControl
          position="bottom-right"
          trackUserLocation
          showAccuracyCircle
          positionOptions={{ enableHighAccuracy: true }}
        />
      )}

      {loaded && mapImage && (
        <Source
          id="event-map-image"
          type="image"
          url={mapImage.imageUrl}
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
        <Marker key={u.userId} longitude={u.lng} latitude={u.lat} anchor="bottom">
          <div
            title={u.userName}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
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
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = getPoiIcon(selectedPoi.icon ?? selectedCategory?.icon);
              return (
                <div
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
              <p className="truncate font-semibold">{selectedPoi.name}</p>
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
    </div>
  );
}
