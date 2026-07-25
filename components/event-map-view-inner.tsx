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
import type { GridCell, LatLng } from "@/lib/geo";
import { gridCellsToGeoJSON } from "@/lib/geo";
import { cn } from "@/lib/utils";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const FALLBACK_CATEGORY_COLOR = "#64748b";

export type EventMapPoiCategory = { id: string; label: string; color: string };

export type EventMapPoi = {
  id: string;
  name: string;
  categoryId: string;
  lat: number;
  lng: number;
};

export type EventMapLiveUser = {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
};

export type EventMapImage = {
  imageUrl: string;
  corners: { tl: LatLng; tr: LatLng; br: LatLng; bl: LatLng };
};

export type FlyToTarget =
  | { type: "bounds"; bounds: [[number, number], [number, number]] }
  | { type: "point"; center: LatLng; zoom?: number };

export type EventMapViewProps = {
  mapImage: EventMapImage | null;
  gridCells?: GridCell[];
  gridLineColor?: string;
  gridLineWidth?: number;
  gridCasingColor?: string;
  gridCasingWidth?: number;
  /** The grid cell found via search — highlighted so it's unmistakable which one was meant. */
  highlightedCell?: GridCell | null;
  pois?: EventMapPoi[];
  categories?: EventMapPoiCategory[];
  visibleCategories?: string[];
  liveUsers?: EventMapLiveUser[];
  geolocate?: boolean;
  onMapClick?: (latLng: LatLng) => void;
  previewMarker?: LatLng | null;
  /** The user's current (real or manually simulated) position — rendered as a prominent marker above everything else. */
  userLocation?: LatLng | null;
  flyToTarget?: FlyToTarget | null;
  className?: string;
};

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
  pois = [],
  categories = [],
  visibleCategories,
  liveUsers = [],
  geolocate = false,
  onMapClick,
  previewMarker,
  userLocation,
  flyToTarget,
  className,
}: EventMapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const initialBounds = mapImage ? cornersToBounds(mapImage.corners) : undefined;

  function handleClick(e: MapLayerMouseEvent) {
    onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  }

  return (
    <div className={cn("h-full w-full", className)}>
    <Map
      ref={mapRef}
      mapStyle={BASEMAP_STYLE}
      initialViewState={
        initialBounds
          ? { bounds: initialBounds, fitBoundsOptions: { padding: 40 } }
          : { longitude: 5.2913, latitude: 52.1326, zoom: 6 }
      }
      style={{ width: "100%", height: "100%" }}
      onClick={onMapClick ? handleClick : undefined}
      cursor={onMapClick ? "crosshair" : "grab"}
      onLoad={() => setLoaded(true)}
    >
      <NavigationControl position="top-right" />
      {geolocate && (
        <GeolocateControl
          position="top-right"
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

      {visiblePois.map((p) => {
        const cat = categoryById[p.categoryId];
        return (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="bottom">
            <div
              title={`${p.name}${cat ? ` (${cat.label})` : ""}`}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: cat?.color ?? FALLBACK_CATEGORY_COLOR,
                border: "2px solid white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            />
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

      {previewMarker && (
        <Marker longitude={previewMarker.lng} latitude={previewMarker.lat} anchor="bottom">
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50% 50% 50% 0",
              background: "#111827",
              border: "2px solid white",
              transform: "rotate(-45deg)",
            }}
          />
        </Marker>
      )}

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
    </div>
  );
}
