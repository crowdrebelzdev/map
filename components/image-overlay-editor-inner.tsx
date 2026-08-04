"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Source,
  Layer,
  Marker,
  NavigationControl,
  type MapRef,
} from "react-map-gl/maplibre";
import type { LngLat } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Move, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  type CornerSet,
  type LatLng,
  type GridLabelOrientation,
  latLngToLocalMeters,
  localMetersToLatLng,
  quadCentroid,
  translateQuad,
  rotateQuad,
  scaleQuad,
  defaultQuadAt,
  computeGridCellsFromQuad,
  gridCellsToGeoJSON,
} from "@/lib/geo";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// How close (in degrees) a drag-rotate has to end up to a cardinal/intercardinal-ish right
// angle (0/90/180/270) before it snaps the rest of the way there — makes it much easier to
// land the base map exactly "recht" (straight) by feel, without having to fight for the
// exact pixel that lands on precisely 0.00000°.
const ROTATION_SNAP_THRESHOLD_DEG = 4;

function normalizeBearing(raw: number): number {
  return ((raw % 360) + 360) % 360;
}

function snappedBearing(raw: number): number {
  const normalized = normalizeBearing(raw);
  const nearest = Math.round(normalized / 90) * 90;
  return Math.abs(normalized - nearest) <= ROTATION_SNAP_THRESHOLD_DEG ? nearest % 360 : normalized;
}

export type EditMode = "image" | "grid";

export type ImageOverlayEditorProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet | null;
  onCornersChange: (corners: CornerSet) => void;
  opacity: number;
  /** The base map's saved compass heading in degrees (see eventMap.bearing). The editor's map
   * always allows free rotation (unlike the read-only views in event-map-view-inner.tsx, which
   * enforce eventMap.lockOrientation) since that's how this value gets set in the first place:
   * the initial view opens at this angle, and `onBearingChange` reports back whenever the admin
   * rotates it further, so "Plaatsing opslaan" always captures whatever's currently on screen. */
  bearing: number;
  onBearingChange: (bearing: number) => void;

  gridCorners: CornerSet | null;
  onGridCornersChange: (corners: CornerSet) => void;
  gridColumns: number;
  gridRows: number;
  gridLabelOrientation: GridLabelOrientation;
  gridLabelPrefix?: string;
  gridLabelLetterStart?: number;
  gridLabelNumberStart?: number;
  gridLabelLetterGroupSize?: number;
  gridLineColor: string;
  gridLineWidth: number;
  gridCasingColor: string;
  gridCasingWidth: number;

  mode: EditMode;
};

type EdgeKey = "top" | "right" | "bottom" | "left";

const EDGE_CORNERS: Record<EdgeKey, [keyof CornerSet, keyof CornerSet]> = {
  top: ["tl", "tr"],
  right: ["tr", "br"],
  bottom: ["br", "bl"],
  left: ["bl", "tl"],
};

function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

function cornerCursor(key: keyof CornerSet) {
  return key === "tl" || key === "br" ? "nwse-resize" : "nesw-resize";
}

function edgeCursor(key: EdgeKey) {
  return key === "top" || key === "bottom" ? "ns-resize" : "ew-resize";
}

function centroidLatLng(corners: CornerSet): LatLng {
  const refLat = corners.tl.lat;
  const m = quadCentroid(corners, refLat);
  return localMetersToLatLng(m.east, m.north, refLat);
}

/** Offsets `from` away from `center` by `extraMeters`, along the center->from direction. */
function offsetOutward(center: LatLng, from: LatLng, extraMeters: number): LatLng {
  const refLat = center.lat;
  const c = latLngToLocalMeters(center, refLat);
  const p = latLngToLocalMeters(from, refLat);
  const dx = p.east - c.east;
  const dy = p.north - c.north;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return localMetersToLatLng(p.east + (dx / len) * extraMeters, p.north + (dy / len) * extraMeters, refLat);
}

type NominatimResult = { lat: string; lon: string; display_name: string };

export default function ImageOverlayEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  corners,
  onCornersChange,
  opacity,
  bearing,
  onBearingChange,
  gridCorners,
  onGridCornersChange,
  gridColumns,
  gridRows,
  gridLabelOrientation,
  gridLabelPrefix,
  gridLabelLetterStart,
  gridLabelNumberStart,
  gridLabelLetterGroupSize,
  gridLineColor,
  gridLineWidth,
  gridCasingColor,
  gridCasingWidth,
  mode,
}: ImageOverlayEditorProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const onBearingChangeRef = useRef(onBearingChange);
  useLayoutEffect(() => {
    onBearingChangeRef.current = onBearingChange;
  }, [onBearingChange]);

  // Live readout for the compass widget below — updates continuously while dragging, unlike
  // `bearing`/`onBearingChange` which only need the settled value once a rotate ends.
  const [displayBearing, setDisplayBearing] = useState(bearing);

  function handleMoveEnd(rawBearing: number) {
    // MapLibre reports bearing in its own range (e.g. -40 for a counter-clockwise turn, not
    // 320) while `snappedBearing` normalizes into [0, 360). Comparing those two forms directly
    // was the bug: for any "negative" raw bearing, they'd never look equal even when they're
    // the same angle, so this always thought a snap-animation was needed — and if MapLibre's
    // own easeTo treated that as a genuine no-op (target angle already reached), it never fired
    // a follow-up moveend, so the committed value below never ran at all. Always commit here,
    // synchronously, using normalized numbers throughout; the easeTo below is purely cosmetic
    // (settling the last visual degree or two into place) and never gates the actual save state.
    const normalized = normalizeBearing(rawBearing);
    const snapped = snappedBearing(rawBearing);
    setDisplayBearing(snapped);
    onBearingChangeRef.current(snapped);
    if (snapped !== normalized) {
      mapRef.current?.getMap().easeTo({ bearing: snapped, duration: 200 });
    }
  }

  function handleResetBearing() {
    mapRef.current?.getMap().easeTo({ bearing: 0, duration: 300 });
  }

  const activeCorners = mode === "image" ? corners : gridCorners;

  // "Latest ref" pattern: maplibre's own pointer-event handlers (registered once, see
  // below) need the current value of these on every call without re-registering on each
  // change. Written in a layout effect rather than during render — React Compiler
  // disallows mutating refs during render — but still lands before any paint or user
  // interaction, so the handlers never see a stale value.
  const modeRef = useRef(mode);
  const cornersRef = useRef(corners);
  const gridCornersRef = useRef(gridCorners);
  const onCornersChangeRef = useRef(onCornersChange);
  const onGridCornersChangeRef = useRef(onGridCornersChange);
  useLayoutEffect(() => {
    modeRef.current = mode;
    cornersRef.current = corners;
    gridCornersRef.current = gridCorners;
    onCornersChangeRef.current = onCornersChange;
    onGridCornersChangeRef.current = onGridCornersChange;
  }, [mode, corners, gridCorners, onCornersChange, onGridCornersChange]);

  function getActiveCorners(): CornerSet | null {
    return modeRef.current === "image" ? cornersRef.current : gridCornersRef.current;
  }
  function setActiveCorners(next: CornerSet) {
    if (modeRef.current === "image") onCornersChangeRef.current(next);
    else onGridCornersChangeRef.current(next);
  }

  const dragStartRef = useRef<{
    corners: CornerSet;
    startLngLat: LatLng;
    center: LatLng;
    startAngle: number;
    startDistance: number;
  } | null>(null);

  const gridCells = useMemo(() => {
    if (!gridCorners || gridColumns <= 0 || gridRows <= 0) return [];
    return computeGridCellsFromQuad(gridCorners, gridColumns, gridRows, gridLabelOrientation, {
      prefix: gridLabelPrefix,
      letterStart: gridLabelLetterStart,
      numberStart: gridLabelNumberStart,
      letterGroupSize: gridLabelLetterGroupSize,
    });
  }, [
    gridCorners,
    gridColumns,
    gridRows,
    gridLabelOrientation,
    gridLabelPrefix,
    gridLabelLetterStart,
    gridLabelNumberStart,
    gridLabelLetterGroupSize,
  ]);
  const gridGeoJson = useMemo(() => gridCellsToGeoJSON(gridCells), [gridCells]);

  function handlePlaceHere() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const center = map.getCenter();
    const metersPerPixelAtZoom =
      (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const targetWidthMeters = metersPerPixelAtZoom * Math.min(map.getCanvas().width * 0.6, 900);

    if (mode === "image") {
      onCornersChange(
        defaultQuadAt(
          { lat: center.lat, lng: center.lng },
          Math.max(targetWidthMeters, 20),
          imageWidth,
          imageHeight,
        ),
      );
    } else if (corners) {
      // Default the grid to the map's current placement — the common case is a printed
      // grid that roughly covers the whole plattegrond; nudge/scale from there.
      onGridCornersChange(corners);
    } else {
      onGridCornersChange(
        defaultQuadAt({ lat: center.lat, lng: center.lng }, Math.max(targetWidthMeters, 20), 1, 1),
      );
    }
  }

  function handleCornerDrag(key: keyof CornerSet, lngLat: LngLat) {
    const current = getActiveCorners();
    if (!current) return;
    setActiveCorners({ ...current, [key]: { lat: lngLat.lat, lng: lngLat.lng } });
  }

  function handleEdgeDragStart(key: EdgeKey) {
    const current = getActiveCorners();
    if (!current) return;
    const [a, b] = EDGE_CORNERS[key];
    dragStartRef.current = {
      corners: current,
      startLngLat: midpoint(current[a], current[b]),
      center: { lat: 0, lng: 0 },
      startAngle: 0,
      startDistance: 0,
    };
  }

  function handleEdgeDrag(key: EdgeKey, lngLat: LngLat) {
    const start = dragStartRef.current;
    if (!start) return;
    const [a, b] = EDGE_CORNERS[key];
    const deltaLat = lngLat.lat - start.startLngLat.lat;
    const deltaLng = lngLat.lng - start.startLngLat.lng;
    setActiveCorners({
      ...start.corners,
      [a]: { lat: start.corners[a].lat + deltaLat, lng: start.corners[a].lng + deltaLng },
      [b]: { lat: start.corners[b].lat + deltaLat, lng: start.corners[b].lng + deltaLng },
    });
  }

  function handleMoveDragStart() {
    const current = getActiveCorners();
    if (!current) return;
    dragStartRef.current = {
      corners: current,
      startLngLat: centroidLatLng(current),
      center: { lat: 0, lng: 0 },
      startAngle: 0,
      startDistance: 0,
    };
  }

  function handleMoveDrag(lngLat: LngLat) {
    const start = dragStartRef.current;
    if (!start) return;
    const deltaLat = lngLat.lat - start.startLngLat.lat;
    const deltaLng = lngLat.lng - start.startLngLat.lng;
    setActiveCorners(translateQuad(start.corners, deltaLat, deltaLng));
  }

  function handleRotateDragStart() {
    const current = getActiveCorners();
    if (!current) return;
    const center = centroidLatLng(current);
    const handlePos = rotateHandlePosition(current);
    const p = latLngToLocalMeters(handlePos, center.lat);
    const c = latLngToLocalMeters(center, center.lat);
    dragStartRef.current = {
      corners: current,
      startLngLat: handlePos,
      center,
      startAngle: Math.atan2(p.north - c.north, p.east - c.east),
      startDistance: 0,
    };
  }

  function handleRotateDrag(lngLat: LngLat) {
    const start = dragStartRef.current;
    if (!start) return;
    const p = latLngToLocalMeters({ lat: lngLat.lat, lng: lngLat.lng }, start.center.lat);
    const c = latLngToLocalMeters(start.center, start.center.lat);
    const angle = Math.atan2(p.north - c.north, p.east - c.east);
    const delta = angle - start.startAngle;
    setActiveCorners(rotateQuad(start.corners, delta, start.center));
  }

  function handleScaleDragStart() {
    const current = getActiveCorners();
    if (!current) return;
    const center = centroidLatLng(current);
    const handlePos = scaleHandlePosition(current);
    const p = latLngToLocalMeters(handlePos, center.lat);
    const c = latLngToLocalMeters(center, center.lat);
    const startDistance = Math.hypot(p.east - c.east, p.north - c.north) || 1;
    dragStartRef.current = {
      corners: current,
      startLngLat: handlePos,
      center,
      startAngle: 0,
      startDistance,
    };
  }

  function handleScaleDrag(lngLat: LngLat) {
    const start = dragStartRef.current;
    if (!start) return;
    const p = latLngToLocalMeters({ lat: lngLat.lat, lng: lngLat.lng }, start.center.lat);
    const c = latLngToLocalMeters(start.center, start.center.lat);
    const distance = Math.hypot(p.east - c.east, p.north - c.north);
    const factor = Math.max(distance / start.startDistance, 0.05);
    setActiveCorners(scaleQuad(start.corners, factor, start.center));
  }

  function rotateHandlePosition(c: CornerSet): LatLng {
    const center = centroidLatLng(c);
    return offsetOutward(center, midpoint(c.tl, c.tr), edgeHandleOffset(c));
  }

  function scaleHandlePosition(c: CornerSet): LatLng {
    const center = centroidLatLng(c);
    return offsetOutward(center, c.br, edgeHandleOffset(c) * 0.6);
  }

  function edgeHandleOffset(c: CornerSet): number {
    const refLat = c.tl.lat;
    const centroidM = quadCentroid(c, refLat);
    const topMidM = latLngToLocalMeters(midpoint(c.tl, c.tr), refLat);
    const len = Math.hypot(topMidM.east - centroidM.east, topMidM.north - centroidM.north) || 1;
    return Math.max(len * 0.35, 8);
  }

  const rotateHandle = activeCorners ? rotateHandlePosition(activeCorners) : null;
  const scaleHandle = activeCorners ? scaleHandlePosition(activeCorners) : null;
  const topMid = activeCorners ? midpoint(activeCorners.tl, activeCorners.tr) : null;
  const handleColor = mode === "image" ? "#111827" : "#9333ea";

  const rotateLineGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    topMid && rotateHandle
      ? {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [topMid.lng, topMid.lat],
              [rotateHandle.lng, rotateHandle.lat],
            ],
          },
        }
      : null;

  const scaleLineGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    activeCorners && scaleHandle
      ? {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [activeCorners.br.lng, activeCorners.br.lat],
              [scaleHandle.lng, scaleHandle.lat],
            ],
          },
        }
      : null;

  // --- Address search (Nominatim / OpenStreetMap, free, no API key) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Cleared in render (below) rather than via setState here when the query is too short —
  // keeps this effect free of a synchronous setState call on that branch.
  const effectiveResults = searchQuery.trim().length < 3 ? [] : searchResults;

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`,
          { signal: controller.signal, headers: { "Accept-Language": "nl" } },
        );
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
      } catch {
        // aborted or network hiccup — ignore, user is likely still typing
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  function handleSelectAddress(result: NominatimResult) {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.flyTo({ center: [parseFloat(result.lon), parseFloat(result.lat)], zoom: 17 });
    setSearchQuery("");
    setSearchResults([]);
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP_STYLE}
        initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 14, bearing }}
        style={{ width: "100%", height: "100%" }}
        // No dragRotate restriction here — the editor always allows free rotation, since
        // that's how `bearing` gets set. maxPitch stays locked at 0 regardless: tilt isn't
        // part of what this feature captures, and it'd only make corner-placement harder.
        maxPitch={0}
        onMove={(e) => setDisplayBearing(e.viewState.bearing)}
        onMoveEnd={(e) => handleMoveEnd(e.viewState.bearing)}
        onLoad={() => {
          setLoaded(true);
          const map = mapRef.current?.getMap();
          if (!map) return;
          // Already-placed plattegrond/grid takes priority — open where the work already
          // is, not a fixed default. Only fall back to the visitor's own location (and,
          // failing that, the hardcoded `initialViewState` above) when nothing is placed yet.
          const existing = corners ?? gridCorners;
          if (existing) {
            const lats = [existing.tl.lat, existing.tr.lat, existing.br.lat, existing.bl.lat];
            const lngs = [existing.tl.lng, existing.tr.lng, existing.br.lng, existing.bl.lng];
            map.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              // MapLibre's fitBounds defaults bearing to 0 unless told otherwise — without
              // this, opening the editor on an already-rotated plattegrond would silently
              // snap the base map back to north on load. map.getBearing() is already correct
              // here (set via initialViewState.bearing above; this initialViewState has no
              // `bounds` of its own, so nothing has fitBounds-reset it yet at this point).
              { padding: 80, duration: 0, bearing: map.getBearing() },
            );
          } else if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }),
              () => {},
              { timeout: 8000 },
            );
          }
        }}
      >
        <NavigationControl position="top-right" />

        {loaded && corners && (
          <Source
            id="overlay-image"
            type="image"
            url={imageUrl}
            coordinates={[
              [corners.tl.lng, corners.tl.lat],
              [corners.tr.lng, corners.tr.lat],
              [corners.br.lng, corners.br.lat],
              [corners.bl.lng, corners.bl.lat],
            ]}
          >
            <Layer id="overlay-image-layer" type="raster" paint={{ "raster-opacity": opacity }} />
          </Source>
        )}

        {loaded && gridCells.length > 0 && (
          <Source id="overlay-grid-lines" type="geojson" data={gridGeoJson.lines}>
            {gridCasingWidth > 0 && (
              <Layer
                id="overlay-grid-lines-casing-layer"
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
              id="overlay-grid-lines-layer"
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

        {loaded && gridCells.length > 0 && (
          <Source id="overlay-grid-labels" type="geojson" data={gridGeoJson.labels}>
            <Layer
              id="overlay-grid-labels-layer"
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

        {rotateLineGeoJson && (
          <Source id="overlay-rotate-line" type="geojson" data={rotateLineGeoJson}>
            <Layer
              id="overlay-rotate-line-layer"
              type="line"
              paint={{ "line-color": handleColor, "line-width": 1.5, "line-dasharray": [2, 2] }}
            />
          </Source>
        )}

        {scaleLineGeoJson && (
          <Source id="overlay-scale-line" type="geojson" data={scaleLineGeoJson}>
            <Layer
              id="overlay-scale-line-layer"
              type="line"
              paint={{ "line-color": "#16a34a", "line-width": 1.5, "line-dasharray": [2, 2] }}
            />
          </Source>
        )}

        {activeCorners &&
          (Object.keys(activeCorners) as (keyof CornerSet)[]).map((key) => (
            <Marker
              key={key}
              longitude={activeCorners[key].lng}
              latitude={activeCorners[key].lat}
              draggable
              // react-map-gl's Marker only invokes onDrag from a real pointer-drag event,
              // never during its own render — safe to read ref-backed state here.
              // eslint-disable-next-line react-hooks/refs
              onDrag={(e) => handleCornerDrag(key, e.lngLat)}
              anchor="center"
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  background: "#ffffff",
                  border: `2px solid ${handleColor}`,
                  cursor: cornerCursor(key),
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
              />
            </Marker>
          ))}

        {activeCorners &&
          (Object.keys(EDGE_CORNERS) as EdgeKey[]).map((key) => {
            const [a, b] = EDGE_CORNERS[key];
            const pos = midpoint(activeCorners[a], activeCorners[b]);
            return (
              <Marker
                key={key}
                longitude={pos.lng}
                latitude={pos.lat}
                draggable
                // Same reasoning as the corner Marker above: only ever fires from a real
                // pointer-drag event.
                // eslint-disable-next-line react-hooks/refs
                onDragStart={() => handleEdgeDragStart(key)}
                // eslint-disable-next-line react-hooks/refs
                onDrag={(e) => handleEdgeDrag(key, e.lngLat)}
                anchor="center"
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#ffffff",
                    border: `2px solid ${handleColor}`,
                    cursor: edgeCursor(key),
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  }}
                />
              </Marker>
            );
          })}

        {activeCorners && (
          <Marker
            longitude={centroidLatLng(activeCorners).lng}
            latitude={centroidLatLng(activeCorners).lat}
            draggable
            onDragStart={handleMoveDragStart}
            onDrag={(e) => handleMoveDrag(e.lngLat)}
            anchor="center"
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: handleColor,
                border: "2px solid white",
                cursor: "move",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
              title={mode === "image" ? "Verplaats de hele plattegrond" : "Verplaats het hele grid"}
            >
              <Move size={14} />
            </div>
          </Marker>
        )}

        {rotateHandle && (
          <Marker
            longitude={rotateHandle.lng}
            latitude={rotateHandle.lat}
            draggable
            onDragStart={handleRotateDragStart}
            onDrag={(e) => handleRotateDrag(e.lngLat)}
            anchor="center"
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#2563eb",
                border: "2px solid white",
                cursor: "grab",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
              title="Draai"
            />
          </Marker>
        )}

        {scaleHandle && (
          <Marker
            longitude={scaleHandle.lng}
            latitude={scaleHandle.lat}
            draggable
            onDragStart={handleScaleDragStart}
            onDrag={(e) => handleScaleDrag(e.lngLat)}
            anchor="center"
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: "#16a34a",
                border: "2px solid white",
                cursor: "nwse-resize",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
              title="Vergroot/verklein (uniform)"
            >
              <Maximize2 size={12} />
            </div>
          </Marker>
        )}
      </Map>

      <div className="absolute bottom-3 left-3">
        <button
          type="button"
          onClick={handleResetBearing}
          title="Klik om de kaart weer recht naar het noorden te draaien"
          className="flex flex-col items-center gap-0.5 rounded-full border bg-background/95 p-1.5 shadow-md backdrop-blur-sm transition hover:bg-muted"
        >
          <svg width="36" height="36" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
            <g style={{ transform: `rotate(${-displayBearing}deg)`, transformOrigin: "20px 20px" }}>
              <line x1="20" y1="4" x2="20" y2="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
              <line x1="20" y1="32" x2="20" y2="36" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
              <line x1="4" y1="20" x2="8" y2="20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
              <line x1="32" y1="20" x2="36" y2="20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
              <polygon points="20,6 23.5,20 20,20 16.5,20" fill="#dc2626" />
              <polygon points="20,34 16.5,20 20,20 23.5,20" fill="#94a3b8" />
              <circle cx="20" cy="20" r="2" fill="currentColor" />
              <text x="20" y="5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#dc2626">
                N
              </text>
            </g>
          </svg>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {Math.round(normalizeBearing(displayBearing))}°
          </span>
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-sm">
          <Input
            placeholder="Zoek adres of locatie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-background shadow-md"
          />
          {(effectiveResults.length > 0 || searching) && (
            <Card className="mt-1 max-h-60 overflow-y-auto py-2">
              <CardContent className="space-y-1 px-2">
                {searching && (
                  <p className="px-2 py-1 text-sm text-muted-foreground">Zoeken...</p>
                )}
                {effectiveResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectAddress(r)}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    title={r.display_name}
                  >
                    {r.display_name}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {!activeCorners && (
          <Button className="pointer-events-auto shadow-lg" onClick={handlePlaceHere}>
            {mode === "image" ? "Plaats hier" : "Grid hier plaatsen"}
          </Button>
        )}
      </div>

      {activeCorners && (
        <div className="absolute right-3 bottom-3">
          <Button variant="secondary" size="sm" className="shadow-lg" onClick={handlePlaceHere}>
            Opnieuw plaatsen
          </Button>
        </div>
      )}
    </div>
  );
}
