import { describe, expect, it } from "vitest";
import {
  computeGridCells,
  computeTransform,
  distanceMeters,
  findGridCellInQuad,
  formatGridCode,
  isPointInPolygon,
  latLngToPixel,
  parseGridCode,
  pixelToLatLng,
  polygonsIntersect,
  type CornerSet,
  type LatLng,
} from "@/lib/geo";

// A plausible non-axis-aligned placement (rotated/skewed rectangle over Amsterdam),
// exercising the full homography fit rather than a trivial identity mapping.
const CORNERS: CornerSet = {
  tl: { lat: 52.3705, lng: 4.8952 },
  tr: { lat: 52.371, lng: 4.9012 },
  br: { lat: 52.3675, lng: 4.9018 },
  bl: { lat: 52.367, lng: 4.8958 },
};
const WIDTH = 2000;
const HEIGHT = 1200;

describe("pixelToLatLng / latLngToPixel", () => {
  const transform = computeTransform(WIDTH, HEIGHT, CORNERS);

  it("maps the image corners onto the placed corners", () => {
    const tl = pixelToLatLng(transform, { x: 0, y: 0 });
    expect(tl.lat).toBeCloseTo(CORNERS.tl.lat, 9);
    expect(tl.lng).toBeCloseTo(CORNERS.tl.lng, 9);

    const br = pixelToLatLng(transform, { x: WIDTH, y: HEIGHT });
    expect(br.lat).toBeCloseTo(CORNERS.br.lat, 9);
    expect(br.lng).toBeCloseTo(CORNERS.br.lng, 9);
  });

  it("round-trips pixel -> latLng -> pixel for an interior point", () => {
    const original = { x: 734, y: 415 };
    const ll = pixelToLatLng(transform, original);
    const back = latLngToPixel(transform, ll);
    expect(back.x).toBeCloseTo(original.x, 6);
    expect(back.y).toBeCloseTo(original.y, 6);
  });

  it("throws on degenerate (collinear/coincident) corners", () => {
    const degenerate: CornerSet = {
      tl: { lat: 52.37, lng: 4.9 },
      tr: { lat: 52.37, lng: 4.9 },
      br: { lat: 52.37, lng: 4.9 },
      bl: { lat: 52.37, lng: 4.9 },
    };
    expect(() => computeTransform(WIDTH, HEIGHT, degenerate)).toThrow();
  });
});

describe("formatGridCode / parseGridCode", () => {
  it("round-trips column-row codes", () => {
    for (const [col, row] of [[0, 0], [2, 4], [25, 0], [26, 3]] as const) {
      const code = formatGridCode(col, row, "column-row");
      expect(parseGridCode(code, "column-row")).toEqual({ col, row });
    }
  });

  it("round-trips row-column codes", () => {
    for (const [col, row] of [[0, 0], [3, 1], [9, 26]] as const) {
      const code = formatGridCode(col, row, "row-column");
      expect(parseGridCode(code, "row-column")).toEqual({ col, row });
    }
  });

  it("uses spreadsheet-style letters beyond Z", () => {
    expect(formatGridCode(26, 0, "column-row")).toBe("AA1");
    expect(formatGridCode(27, 0, "column-row")).toBe("AB1");
  });

  it("returns null for malformed codes", () => {
    expect(parseGridCode("", "column-row")).toBeNull();
    expect(parseGridCode("12", "column-row")).toBeNull();
    expect(parseGridCode("AB", "column-row")).toBeNull();
  });

  it("defaults to letter-then-number, unaffected by orientation", () => {
    expect(formatGridCode(1, 37, "column-row")).toBe("B38");
    expect(formatGridCode(37, 1, "row-column")).toBe("B38");
  });

  it("puts the number first when order is number-letter", () => {
    expect(formatGridCode(1, 37, "column-row", { order: "number-letter" })).toBe("38B");
    expect(formatGridCode(37, 1, "row-column", { order: "number-letter" })).toBe("38B");
  });

  it("round-trips number-letter codes", () => {
    for (const [col, row] of [[0, 0], [2, 4], [25, 0], [26, 3]] as const) {
      const opts = { order: "number-letter" as const };
      const code = formatGridCode(col, row, "column-row", opts);
      expect(parseGridCode(code, "column-row", opts)).toEqual({ col, row });
    }
  });

  it("does not cross-parse letter-number and number-letter codes", () => {
    const letterFirst = formatGridCode(1, 37, "column-row");
    expect(parseGridCode(letterFirst, "column-row", { order: "number-letter" })).toBeNull();
    const numberFirst = formatGridCode(1, 37, "column-row", { order: "number-letter" });
    expect(parseGridCode(numberFirst, "column-row")).toBeNull();
  });
});

describe("computeGridCells / findGridCellInQuad", () => {
  it("produces columns x rows cells with unique codes", () => {
    const transform = computeTransform(WIDTH, HEIGHT, CORNERS);
    const cells = computeGridCells(transform, {
      originPixelX: 0,
      originPixelY: 0,
      cellWidthPixels: WIDTH / 4,
      cellHeightPixels: HEIGHT / 3,
      columns: 4,
      rows: 3,
      labelOrientation: "column-row",
    });
    expect(cells).toHaveLength(12);
    expect(new Set(cells.map((c) => c.code)).size).toBe(12);
  });

  it("finds the cell containing an interior point, and null outside the quad", () => {
    // A point safely inside cell (0, 0) of a 4x3 grid placed on the unit quad — the exact
    // quad corner is a bad test point here since it sits on a cell boundary, where floating
    // point error can floor it into the adjacent (out-of-range) cell.
    const gridTransform = computeTransform(4, 3, CORNERS);
    const interior = pixelToLatLng(gridTransform, { x: 0.25, y: 0.25 });

    const cell = findGridCellInQuad(CORNERS, 4, 3, "column-row", interior);
    expect(cell?.col).toBe(0);
    expect(cell?.row).toBe(0);

    const farAway = { lat: CORNERS.tl.lat + 1, lng: CORNERS.tl.lng + 1 };
    expect(findGridCellInQuad(CORNERS, 4, 3, "column-row", farAway)).toBeNull();
  });
});

describe("polygonsIntersect", () => {
  // A simple 1x1 square cell, (0,0) to (1,1) in lat/lng terms.
  const cell: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];

  it("is true when one polygon fully contains the other", () => {
    const bigArea: LatLng[] = [
      { lat: -5, lng: -5 },
      { lat: -5, lng: 5 },
      { lat: 5, lng: 5 },
      { lat: 5, lng: -5 },
    ];
    expect(polygonsIntersect(cell, bigArea)).toBe(true);
  });

  it("is false when polygons are entirely apart", () => {
    const farAway: LatLng[] = [
      { lat: 10, lng: 10 },
      { lat: 10, lng: 11 },
      { lat: 11, lng: 11 },
      { lat: 11, lng: 10 },
    ];
    expect(polygonsIntersect(cell, farAway)).toBe(false);
  });

  it("is true when an area only clips a cell's corner, even though the cell's center stays outside", () => {
    // Triangle covering the region beyond the line lat+lng=1.9, which clips the cell's
    // (1, 1) corner but doesn't reach anywhere near the cell's center (0.5, 0.5) — exactly
    // the case `isPointInPolygon(cell.center, area)` used to miss.
    const cornerClip: LatLng[] = [
      { lat: 0.4, lng: 1.5 },
      { lat: 1.5, lng: 0.4 },
      { lat: 1.5, lng: 1.5 },
    ];
    expect(isPointInPolygon({ lat: 0.5, lng: 0.5 }, cornerClip)).toBe(false);
    expect(polygonsIntersect(cell, cornerClip)).toBe(true);
  });
});

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 52.37, lng: 4.9 }, { lat: 52.37, lng: 4.9 })).toBe(0);
  });

  it("matches the ~111.32km/degree-of-latitude approximation", () => {
    const a = { lat: 52.0, lng: 4.9 };
    const b = { lat: 52.001, lng: 4.9 };
    expect(distanceMeters(a, b)).toBeCloseTo(111.32, 0);
  });

  it("is symmetric", () => {
    const a = { lat: 52.37, lng: 4.9 };
    const b = { lat: 52.3705, lng: 4.9012 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 9);
  });
});
