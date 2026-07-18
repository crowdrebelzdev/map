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
import type { PoiCategory } from "@/db/schema";
import { cn } from "@/lib/utils";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  security: "#dc2626",
  medical: "#16a34a",
  toilet: "#2563eb",
  stage: "#9333ea",
  other: "#64748b",
};

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  security: "Beveiliging",
  medical: "EHBO",
  toilet: "Toiletten",
  stage: "Podium",
  other: "Overig",
};

export type EventMapPoi = {
  id: string;
  name: string;
  category: PoiCategory;
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
  pois?: EventMapPoi[];
  visibleCategories?: PoiCategory[];
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
  pois = [],
  visibleCategories,
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

  const visiblePois = useMemo(
    () =>
      visibleCategories
        ? pois.filter((p) => visibleCategories.includes(p.category))
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

      {gridCells.length > 0 && (
        <Source id="grid-lines" type="geojson" data={gridGeoJson.lines}>
          <Layer
            id="grid-lines-layer"
            type="line"
            paint={{ "line-color": "#facc15", "line-width": 2.5, "line-opacity": 1 }}
          />
        </Source>
      )}

      {/* Labels are dropped at low zoom on purpose: with hundreds of cells they'd overlap into
          unreadable clutter and visually bury the grid lines. They fade in once zoomed in enough
          to actually read them (e.g. after a grid-code search flies the user in). */}
      {gridCells.length > 0 && (
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

      {visiblePois.map((p) => (
        <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="bottom">
          <div
            title={`${p.name} (${POI_CATEGORY_LABELS[p.category]})`}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: POI_CATEGORY_COLORS[p.category],
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            }}
          />
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
