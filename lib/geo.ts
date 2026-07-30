export type Pixel = { x: number; y: number };
export type LatLng = { lat: number; lng: number };
export type CornerSet = { tl: LatLng; tr: LatLng; br: LatLng; bl: LatLng };

const EARTH_RADIUS_M = 6378137;

function metersPerDegLat() {
  return (Math.PI / 180) * EARTH_RADIUS_M;
}

function metersPerDegLng(atLat: number) {
  return (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((atLat * Math.PI) / 180);
}

/** Local flat-earth projection: lat/lng -> meters east/north relative to a reference latitude. */
export function latLngToLocalMeters(p: LatLng, refLat: number) {
  return {
    east: p.lng * metersPerDegLng(refLat),
    north: p.lat * metersPerDegLat(),
  };
}

export function localMetersToLatLng(east: number, north: number, refLat: number): LatLng {
  return {
    lat: north / metersPerDegLat(),
    lng: east / metersPerDegLng(refLat),
  };
}

/** Straight-line distance in meters between two points, via the same flat-earth
 * approximation used throughout this file — accurate enough at event scale (a venue
 * spans meters to a few kilometers, nowhere near where the flat-earth error compounds). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const refLat = (a.lat + b.lat) / 2;
  const east = (b.lng - a.lng) * metersPerDegLng(refLat);
  const north = (b.lat - a.lat) * metersPerDegLat();
  return Math.sqrt(east * east + north * north);
}

// --- Generic linear algebra (Gaussian elimination with partial pivoting) ---

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-9) {
      throw new Error(
        "De hoekpunten zijn degeneratief (te dicht bij elkaar of op één lijn) — pas de plaatsing aan.",
      );
    }
    for (let c = col; c <= n; c++) M[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/** 8-parameter planar homography (h33 fixed at 1) fitted exactly from 4 point correspondences. */
type Dlt = [number, number, number, number, number, number, number, number];

function computeDlt(src: [number, number][], dst: [number, number][]): Dlt {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  return solveLinearSystem(A, b) as Dlt;
}

function applyDlt(h: Dlt, x: number, y: number): [number, number] {
  const [h11, h12, h13, h21, h22, h23, h31, h32] = h;
  const w = h31 * x + h32 * y + 1;
  return [(h11 * x + h12 * y + h13) / w, (h21 * x + h22 * y + h23) / w];
}

/**
 * Maps between an image's pixel space and real-world lat/lng, fitted from the
 * image's 4 corners placed freely (independently) onto the map — i.e. a full
 * perspective (homography) fit, not just translation/rotation/uniform scale.
 * This lets a corner be dragged independently to stretch, skew or rotate the
 * image until it matches the real map underneath.
 */
export type Transform = {
  refLat: number;
  forward: Dlt; // pixel -> local meters
  inverse: Dlt; // local meters -> pixel
};

export function computeTransform(
  imageWidth: number,
  imageHeight: number,
  corners: CornerSet,
): Transform {
  const refLat = (corners.tl.lat + corners.tr.lat + corners.br.lat + corners.bl.lat) / 4;

  const srcPixels: [number, number][] = [
    [0, 0],
    [imageWidth, 0],
    [imageWidth, imageHeight],
    [0, imageHeight],
  ];

  const dstMeters = [corners.tl, corners.tr, corners.br, corners.bl].map((c) => {
    const m = latLngToLocalMeters(c, refLat);
    return [m.east, m.north] as [number, number];
  });

  return {
    refLat,
    forward: computeDlt(srcPixels, dstMeters),
    inverse: computeDlt(dstMeters, srcPixels),
  };
}

export function pixelToLatLng(t: Transform, p: Pixel): LatLng {
  const [east, north] = applyDlt(t.forward, p.x, p.y);
  return localMetersToLatLng(east, north, t.refLat);
}

export function latLngToPixel(t: Transform, ll: LatLng): Pixel {
  const m = latLngToLocalMeters(ll, t.refLat);
  const [x, y] = applyDlt(t.inverse, m.east, m.north);
  return { x, y };
}

// --- Corner-quad manipulation helpers (used by the interactive overlay editor) ---

export function quadCentroid(corners: CornerSet, refLat: number) {
  const pts = [corners.tl, corners.tr, corners.br, corners.bl].map((c) =>
    latLngToLocalMeters(c, refLat),
  );
  const east = pts.reduce((s, p) => s + p.east, 0) / 4;
  const north = pts.reduce((s, p) => s + p.north, 0) / 4;
  return { east, north };
}

export function translateQuad(corners: CornerSet, deltaLat: number, deltaLng: number): CornerSet {
  const shift = (c: LatLng) => ({ lat: c.lat + deltaLat, lng: c.lng + deltaLng });
  return { tl: shift(corners.tl), tr: shift(corners.tr), br: shift(corners.br), bl: shift(corners.bl) };
}

/** Rotates all 4 corners by `angleRad` around `aroundLatLng`. */
export function rotateQuad(corners: CornerSet, angleRad: number, aroundLatLng: LatLng): CornerSet {
  const refLat = aroundLatLng.lat;
  const center = latLngToLocalMeters(aroundLatLng, refLat);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const rotatePoint = (c: LatLng): LatLng => {
    const p = latLngToLocalMeters(c, refLat);
    const dx = p.east - center.east;
    const dy = p.north - center.north;
    const east = center.east + dx * cos - dy * sin;
    const north = center.north + dx * sin + dy * cos;
    return localMetersToLatLng(east, north, refLat);
  };

  return {
    tl: rotatePoint(corners.tl),
    tr: rotatePoint(corners.tr),
    br: rotatePoint(corners.br),
    bl: rotatePoint(corners.bl),
  };
}

/** Uniformly scales all 4 corners by `factor` around `aroundLatLng`, keeping shape and rotation. */
export function scaleQuad(corners: CornerSet, factor: number, aroundLatLng: LatLng): CornerSet {
  const refLat = aroundLatLng.lat;
  const center = latLngToLocalMeters(aroundLatLng, refLat);

  const scalePoint = (c: LatLng): LatLng => {
    const p = latLngToLocalMeters(c, refLat);
    const east = center.east + (p.east - center.east) * factor;
    const north = center.north + (p.north - center.north) * factor;
    return localMetersToLatLng(east, north, refLat);
  };

  return {
    tl: scalePoint(corners.tl),
    tr: scalePoint(corners.tr),
    br: scalePoint(corners.br),
    bl: scalePoint(corners.bl),
  };
}

/** Default axis-aligned placement centered at `center`, `widthMeters` wide, preserving image aspect ratio. */
export function defaultQuadAt(
  center: LatLng,
  widthMeters: number,
  imageWidth: number,
  imageHeight: number,
): CornerSet {
  const refLat = center.lat;
  const heightMeters = widthMeters * (imageHeight / imageWidth);
  const c = latLngToLocalMeters(center, refLat);
  const hw = widthMeters / 2;
  const hh = heightMeters / 2;

  return {
    tl: localMetersToLatLng(c.east - hw, c.north + hh, refLat),
    tr: localMetersToLatLng(c.east + hw, c.north + hh, refLat),
    br: localMetersToLatLng(c.east + hw, c.north - hh, refLat),
    bl: localMetersToLatLng(c.east - hw, c.north - hh, refLat),
  };
}

// --- Grid ---

export type GridLabelOrientation = "column-row" | "row-column";

/** Lets a grid that only covers part of a venue's larger, pre-printed grid line up with it
 * (e.g. a plattegrond labelled "10E1".."10E3" needs prefix "10" and letterStart pointing at
 * "E"). Omitting this reproduces the old always-starts-at-A1 behavior exactly.
 *
 * `letterGroupSize`, when set (>0), subdivides the letter axis into groups of that size and
 * switches the code shape to "{number}{letter}{subnumber}" (e.g. "10E1".."10E4", "10F1"..) —
 * how many real venues print their own master grid, with a coarse lettered zone further split
 * into a handful of numbered sub-cells. */
export type GridLabelOptions = {
  prefix?: string;
  letterStart?: number;
  numberStart?: number;
  letterGroupSize?: number;
};

export type GridConfigInput = {
  originPixelX: number;
  originPixelY: number;
  cellWidthPixels: number;
  cellHeightPixels: number;
  columns: number;
  rows: number;
  labelOrientation: GridLabelOrientation;
  labelOptions?: GridLabelOptions;
};

export type GridCell = {
  code: string;
  col: number;
  row: number;
  pixelBounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** True corners of the cell (tl, tr, br, bl), following the image's fitted transform. */
  corners: [LatLng, LatLng, LatLng, LatLng];
  /** Axis-aligned bounding box of the corners — for fitBounds, not for rendering the cell shape. */
  latLngBounds: { sw: LatLng; ne: LatLng };
  center: LatLng;
};

function columnLabel(col: number): string {
  let label = "";
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * "column-row": letter identifies the column, number identifies the row (e.g. "C2" = column C, row 2).
 * "row-column": letter identifies the row, number identifies the column (e.g. "B3" = row B, column 3) —
 * matches how many printed event grids are labelled (rows lettered down the side, columns numbered along the top).
 */
export function formatGridCode(
  col: number,
  row: number,
  orientation: GridLabelOrientation,
  labelOptions?: GridLabelOptions,
): string {
  const prefix = labelOptions?.prefix ?? "";
  const letterStart = labelOptions?.letterStart ?? 0;
  const numberStart = labelOptions?.numberStart ?? 1;
  const groupSize = labelOptions?.letterGroupSize ?? 0;

  const letterAxis = orientation === "row-column" ? row : col;
  const numberAxis = orientation === "row-column" ? col : row;

  if (groupSize > 0) {
    const groupIndex = Math.floor(letterAxis / groupSize);
    const subNumber = (letterAxis % groupSize) + 1;
    return `${prefix}${numberAxis + numberStart}${columnLabel(groupIndex + letterStart)}${subNumber}`;
  }

  return `${prefix}${columnLabel(letterAxis + letterStart)}${numberAxis + numberStart}`;
}

export function computeGridCells(t: Transform, grid: GridConfigInput): GridCell[] {
  const cells: GridCell[] = [];

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const minX = grid.originPixelX + col * grid.cellWidthPixels;
      const maxX = minX + grid.cellWidthPixels;
      const minY = grid.originPixelY + row * grid.cellHeightPixels;
      const maxY = minY + grid.cellHeightPixels;

      const corners: [LatLng, LatLng, LatLng, LatLng] = [
        pixelToLatLng(t, { x: minX, y: minY }),
        pixelToLatLng(t, { x: maxX, y: minY }),
        pixelToLatLng(t, { x: maxX, y: maxY }),
        pixelToLatLng(t, { x: minX, y: maxY }),
      ];

      const lats = corners.map((c) => c.lat);
      const lngs = corners.map((c) => c.lng);

      cells.push({
        code: formatGridCode(col, row, grid.labelOrientation, grid.labelOptions),
        col,
        row,
        pixelBounds: { minX, minY, maxX, maxY },
        corners,
        latLngBounds: {
          sw: { lat: Math.min(...lats), lng: Math.min(...lngs) },
          ne: { lat: Math.max(...lats), lng: Math.max(...lngs) },
        },
        center: pixelToLatLng(t, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }),
      });
    }
  }

  return cells;
}

/**
 * Computes grid cells for a grid that is placed as its own independent quad (4 corners),
 * decoupled from any map image's pixel space. `columns`x`rows` is treated as a unit pixel
 * grid that gets fitted onto `corners` via the same homography machinery as the map image.
 */
export function computeGridCellsFromQuad(
  corners: CornerSet,
  columns: number,
  rows: number,
  labelOrientation: GridLabelOrientation,
  labelOptions?: GridLabelOptions,
): GridCell[] {
  const transform = computeTransform(columns, rows, corners);
  return computeGridCells(transform, {
    originPixelX: 0,
    originPixelY: 0,
    cellWidthPixels: 1,
    cellHeightPixels: 1,
    columns,
    rows,
    labelOrientation,
    labelOptions,
  });
}

/** Builds GeoJSON for rendering grid cell outlines (polygons) and center labels (points). */
export function gridCellsToGeoJSON(cells: GridCell[]) {
  const lines: GeoJSON.FeatureCollection<GeoJSON.Polygon, { code: string }> = {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      properties: { code: cell.code },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            ...cell.corners.map((c) => [c.lng, c.lat]),
            [cell.corners[0].lng, cell.corners[0].lat],
          ],
        ],
      },
    })),
  };

  const labels: GeoJSON.FeatureCollection<GeoJSON.Point, { code: string }> = {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      properties: { code: cell.code },
      geometry: { type: "Point", coordinates: [cell.center.lng, cell.center.lat] },
    })),
  };

  return { lines, labels };
}

function letterToIndex(letters: string): number {
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** Parse a grid code like "C4" or "10E1" into { col, row } (0-indexed), given the labelling
 * orientation and the same labelOptions the grid was rendered with. Returns null if invalid,
 * including when the code doesn't start with the expected prefix. */
export function parseGridCode(
  code: string,
  orientation: GridLabelOrientation,
  labelOptions?: GridLabelOptions,
): { col: number; row: number } | null {
  const prefix = labelOptions?.prefix ?? "";
  const letterStart = labelOptions?.letterStart ?? 0;
  const numberStart = labelOptions?.numberStart ?? 1;
  const groupSize = labelOptions?.letterGroupSize ?? 0;

  let input = code.trim().toUpperCase();
  if (prefix) {
    const normalizedPrefix = prefix.trim().toUpperCase();
    if (!input.startsWith(normalizedPrefix)) return null;
    input = input.slice(normalizedPrefix.length);
  }

  let letterAxis: number;
  let numberAxis: number;

  if (groupSize > 0) {
    const match = input.match(/^(\d+)([A-Z]+)(\d+)$/);
    if (!match) return null;
    const [, numberDigits, letters, subDigits] = match;
    const groupIndex = letterToIndex(letters) - letterStart;
    const subIndex = parseInt(subDigits, 10) - 1;
    if (groupIndex < 0 || subIndex < 0 || subIndex >= groupSize) return null;
    letterAxis = groupIndex * groupSize + subIndex;
    numberAxis = parseInt(numberDigits, 10) - numberStart;
  } else {
    const match = input.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const [, letters, digits] = match;
    letterAxis = letterToIndex(letters) - letterStart;
    numberAxis = parseInt(digits, 10) - numberStart;
  }

  if (letterAxis < 0 || numberAxis < 0) return null;

  return orientation === "row-column"
    ? { row: letterAxis, col: numberAxis }
    : { col: letterAxis, row: numberAxis };
}

/** Find which grid cell a lat/lng point falls into, if any, for a grid placed as its own quad. */
export function findGridCellInQuad(
  corners: CornerSet,
  columns: number,
  rows: number,
  labelOrientation: GridLabelOrientation,
  point: LatLng,
  labelOptions?: GridLabelOptions,
): GridCell | null {
  const transform = computeTransform(columns, rows, corners);
  const pixel = latLngToPixel(transform, point);

  const col = Math.floor(pixel.x);
  const row = Math.floor(pixel.y);

  if (col < 0 || col >= columns || row < 0 || row >= rows) {
    return null;
  }

  return (
    computeGridCellsFromQuad(corners, columns, rows, labelOrientation, labelOptions).find(
      (c) => c.col === col && c.row === row,
    ) ?? null
  );
}

/** Ray-casting point-in-polygon test, working directly in lat/lng — fine at the local
 * scale an event venue covers (same flat-earth approximation used elsewhere in this file).
 * Feeds area click-detection, grid-cell overlap, and live-location containment. */
export function isPointInPolygon(point: LatLng, vertices: LatLng[]): boolean {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    const intersects =
      vi.lng > point.lng !== vj.lng > point.lng &&
      point.lat < ((vj.lat - vi.lat) * (point.lng - vi.lng)) / (vj.lng - vi.lng) + vi.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return (d1 > 0 !== d2 > 0) && (d3 > 0 !== d4 > 0);
}

/** True if two polygons overlap at all — including a sliver where neither has a vertex
 * inside the other (e.g. an area edge just clipping a grid cell's corner). Used instead of
 * `isPointInPolygon` on a cell's center, which would miss any cell an area only partially
 * covers. */
export function polygonsIntersect(a: LatLng[], b: LatLng[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  if (a.some((p) => isPointInPolygon(p, b))) return true;
  if (b.some((p) => isPointInPolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
