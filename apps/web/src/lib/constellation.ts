/**
 * Facts shown on the constellation sheet (#61), computed from the star catalogue and the figure
 * lines: brightest star, whether the figure is above the horizon, and how to frame it.
 */
import {
  applyMat3,
  j2000ToHorizontalMatrix,
  unitVector,
  type Observer,
  type Vec3,
} from "@asteria/astro-core";
import { projectStereo, viewMatrix, type CatalogStar, type ViewState } from "@asteria/sky-renderer";

const DEG = 180 / Math.PI;

/** Brightest catalogue star (lowest V) belonging to a constellation; null if none. */
export function brightestStar(stars: readonly CatalogStar[], abbr: string): CatalogStar | null {
  let best: CatalogStar | null = null;
  for (const s of stars) if (s.con === abbr && (!best || s.v < best.v)) best = s;
  return best;
}

/** Directions (J2000 unit vectors) of the stars drawn in a constellation's figure. */
export function figureDirections(
  stars: readonly CatalogStar[],
  lines: Readonly<Record<string, number[][]>>,
  abbr: string,
): Vec3[] {
  const hips = new Set((lines[abbr] ?? []).flat());
  return stars.filter((s) => hips.has(s.hip)).map((s) => unitVector(s.ra, s.dec));
}

export type Visibility = "up" | "partial" | "down";

/** Above the horizon if every figure star is, below if none is, partially otherwise. */
export function visibility(altitudes: readonly number[]): Visibility {
  const above = altitudes.filter((a) => a > 0).length;
  return above === 0 ? "down" : above === altitudes.length ? "up" : "partial";
}

export interface FigurePlacement {
  visibility: Visibility;
  /** Horizontal coordinates (degrees) of the figure's centre. */
  altitude: number;
  azimuth: number;
  /** Horizontal unit vectors (North, East, Up) of the figure stars. */
  stars: Vec3[];
}

/** Where the figure stands for an observer at a date. Null when there is no figure star. */
export function placeFigure(
  dirs: readonly Vec3[],
  date: Date,
  observer: Observer,
): FigurePlacement | null {
  if (!dirs.length) return null;
  const m = j2000ToHorizontalMatrix(date, observer);
  const hor = dirs.map((d) => applyMat3(m, d));
  const c = hor.reduce<Vec3>((s, h) => [s[0] + h[0], s[1] + h[1], s[2] + h[2]], [0, 0, 0]);
  const n = Math.hypot(...c) || 1;
  return {
    visibility: visibility(hor.map((h) => Math.asin(h[2]) * DEG)),
    altitude: Math.asin(c[2] / n) * DEG,
    azimuth: (((Math.atan2(c[1], c[0]) * DEG) % 360) + 360) % 360, // (North, East, Up) frame
    stars: hor,
  };
}

/** Screen position of a horizontal direction: [x, y] as fractions of the width/height. */
function screenFraction(
  h: Vec3,
  view: Readonly<ViewState>,
  aspect: number,
): [number, number] | null {
  const v = applyMat3(viewMatrix(view), h);
  if (v[2] <= -0.5) return null;
  const scale = 1 / (2 * Math.tan(view.fov / DEG / 4));
  const [nx, ny] = projectStereo(v, scale, aspect);
  return [(nx + 1) / 2, (1 - ny) / 2];
}

/**
 * View that brings a figure above the sheet: its centre goes to `yTarget` (fraction of the height
 * from the top). Null when every star above the horizon already sits between 8 % and `yMax` of the
 * height and inside the width, i.e. nothing is hidden by the sheet.
 */
export function frameAbove(
  figure: Pick<FigurePlacement, "altitude" | "azimuth" | "stars">,
  view: Readonly<ViewState>,
  aspect: number,
  yTarget = 0.25,
  yMax = 0.44,
): { azimuth: number; altitude: number } | null {
  const visible = figure.stars.filter((h) => h[2] > 0);
  const fits = visible.every((h) => {
    const p = screenFraction(h, view, aspect);
    return !!p && p[1] >= 0.08 && p[1] <= yMax && p[0] >= 0.02 && p[0] <= 0.98;
  });
  if (fits) return null;
  // Angle between the screen centre and a point drawn at ny = 1 − 2·yTarget (stereographic).
  const offset = 2 * Math.atan((1 - 2 * yTarget) * Math.tan(view.fov / DEG / 4)) * DEG;
  return { azimuth: figure.azimuth, altitude: figure.altitude - offset };
}
