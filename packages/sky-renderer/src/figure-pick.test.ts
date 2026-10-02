import { describe, expect, it } from "vitest";
import {
  convexHull,
  distanceToSegment,
  pickFigure,
  pickLabel,
  pointInPolygon,
  polygonArea,
  type FigureShape,
} from "./figure-pick";

describe("convexHull", () => {
  it("drops interior points and keeps the corners", () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [5, 5],
      [10, 10],
      [0, 10],
      [3, 4],
    ]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(100);
  });

  it("returns [] for fewer than 3 points or collinear points", () => {
    expect(
      convexHull([
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([]);
    expect(
      convexHull([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toEqual([]);
  });
});

describe("pointInPolygon / distanceToSegment", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ] as const;
  it("tests inside and outside", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });
  it("measures the distance to the segment, not the line", () => {
    expect(distanceToSegment([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distanceToSegment([13, 4], [0, 0], [10, 0])).toBe(5);
  });
});

describe("pickFigure", () => {
  const big: FigureShape = {
    abbr: "Big",
    segments: [
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 0],
        [100, 100],
      ],
      [
        [100, 100],
        [0, 100],
      ],
    ],
  };
  const small: FigureShape = {
    abbr: "Sml",
    segments: [
      [
        [40, 40],
        [60, 40],
      ],
      [
        [60, 40],
        [50, 60],
      ],
    ],
  };
  const thin: FigureShape = {
    abbr: "Thn",
    segments: [
      [
        [200, 0],
        [300, 0],
      ],
    ],
  };

  it("prefers the smallest figure containing the tap", () => {
    expect(pickFigure([50, 45], [big, small])).toBe("Sml");
    expect(pickFigure([20, 80], [big, small])).toBe("Big");
  });

  it("selects a thin figure near its segment, nothing in empty sky", () => {
    expect(pickFigure([250, 10], [big, thin])).toBe("Thn");
    expect(pickFigure([250, 40], [big, thin])).toBeNull();
  });
});

describe("pickLabel", () => {
  const labels = [
    { abbr: "Ori", rect: { x: 100, y: 100, w: 40, h: 12 } },
    { abbr: "Tau", rect: { x: 100, y: 120, w: 40, h: 12 } },
  ];
  it("grows the label to a touch target and picks the nearest middle line", () => {
    expect(pickLabel([120, 92], labels)).toBe("Ori");
    expect(pickLabel([96, 106], labels)).toBe("Ori");
    expect(pickLabel([120, 124], labels)).toBe("Tau");
    expect(pickLabel([160, 106], labels)).toBeNull();
  });
});
