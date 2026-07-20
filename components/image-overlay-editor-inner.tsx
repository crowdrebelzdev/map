"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export type EditMode = "image" | "grid";

export type ImageOverlayEditorProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  corners: CornerSet | null;
  onCornersChange: (corners: CornerSet) => void;
  opacity: number;

  gridCorners: CornerSet | null;
  onGridCornersChange: (corners: CornerSet) => void;
  gridColumns: number;
  gridRows: number;
  gridLabelOrientation: GridLabelOrientation;
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
  gridCorners,
  onGridCornersChange,
  gridColumns,
  gridRows,
  gridLabelOrientation,
  gridLineColor,
  gridLineWidth,
  gridCasingColor,
  gridCasingWidth,
  mode,
}: ImageOverlayEditorProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [loaded, setLoaded] = useState(false);

  const activeCorners = mode === "image" ? corners : gridCorners;

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const gridCornersRef = useRef(gridCorners);
  gridCornersRef.current = gridCorners;
  const onCornersChangeRef = useRef(onCornersChange);
  onCornersChangeRef.current = onCornersChange;
  const onGridCornersChangeRef = useRef(onGridCornersChange);
  onGridCornersChangeRef.current = onGridCornersChange;

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
    return computeGridCellsFromQuad(gridCorners, gridColumns, gridRows, gridLabelOrientation);
  }, [gridCorners, gridColumns, gridRows, gridLabelOrientation]);
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

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
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
        initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 14 }}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => setLoaded(true)}
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
                onDragStart={() => handleEdgeDragStart(key)}
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

      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-sm">
          <Input
            placeholder="Zoek adres of locatie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-background shadow-md"
          />
          {(searchResults.length > 0 || searching) && (
            <Card className="mt-1 max-h-60 overflow-y-auto py-2">
              <CardContent className="space-y-1 px-2">
                {searching && (
                  <p className="px-2 py-1 text-sm text-muted-foreground">Zoeken...</p>
                )}
                {searchResults.map((r, i) => (
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
