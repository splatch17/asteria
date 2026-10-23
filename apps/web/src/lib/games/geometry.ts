/**
 * Where a constellation's figure lies (#163): its centre and angular size, from the catalogue
 * and the figure lines the map draws. Used to frame a question on the sky map, to choose
 * plausible wrong answers (neighbours) and to know what is up tonight.
 */
import {
  greenwichMeanSiderealTime,
  precessionMatrix,
  applyMat3,
  unitVector,
  type Observer,
  type Vec3,
} from "@asteria/astro-core";

const DEG = 180 / Math.PI;

export interface ConstellationShape {
  abbr: string;
  /** Unit vector (J2000) towards the mean of the figure's stars. */
  centre: Vec3;
  /** Largest angle (degrees) between the centre and a star of the figure. */
  radius: number;
}

/** Angle in degrees between two unit vectors. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, dot))) * DEG;
}

/** Shapes of the figures (each star of a figure counts once); figures without known stars are left out. */
export function constellationShapes(
  stars: readonly { hip: number; ra: number; dec: number }[],
  lines: Readonly<Record<string, readonly (readonly number[])[]>>,
): Record<string, ConstellationShape> {
  const byHip = new Map(stars.map((s) => [s.hip, s]));
  const out: Record<string, ConstellationShape> = {};
  for (const [abbr, polys] of Object.entries(lines)) {
    const dirs = [...new Set(polys.flat())]
      .map((hip) => byHip.get(hip))
      .filter((s) => s !== undefined)
      .map((s) => unitVector(s.ra, s.dec));
    if (!dirs.length) continue;
    const sum = dirs.reduce<Vec3>(
      (acc, d) => [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]],
      [0, 0, 0],
    );
    const n = Math.hypot(...sum) || 1;
    const centre: Vec3 = [sum[0] / n, sum[1] / n, sum[2] / n];
    const radius = Math.max(...dirs.map((d) => angleBetween(centre, d)));
    out[abbr] = { abbr, centre, radius };
  }
  return out;
}

/** The stars of each figure (each once), with their direction and magnitude (#187). */
export function figureStars(
  stars: readonly { hip: number; ra: number; dec: number; v: number }[],
  lines: Readonly<Record<string, readonly (readonly number[])[]>>,
): Record<string, { dir: Vec3; v: number }[]> {
  const byHip = new Map(stars.map((s) => [s.hip, s]));
  const out: Record<string, { dir: Vec3; v: number }[]> = {};
  for (const [abbr, polys] of Object.entries(lines)) {
    const list = [...new Set(polys.flat())]
      .map((hip) => byHip.get(hip))
      .filter((s) => s !== undefined)
      .map((s) => ({ dir: unitVector(s.ra, s.dec), v: s.v }));
    if (list.length) out[abbr] = list;
  }
  return out;
}

/**
 * An observer who sees `centre` (J2000) exactly at the zenith at `date`: latitude = declination
 * of date, local sidereal time = right ascension of date. The sky map then shows the figure
 * straight up, north at the top and east on the left as on any sky chart, and the horizon far
 * outside the frame.
 */
export function zenithObserver(centre: Vec3, date: Date): Observer {
  const [x, y, z] = applyMat3(precessionMatrix(date), centre);
  const latitude = Math.asin(Math.max(-1, Math.min(1, z))) * DEG;
  const ra = Math.atan2(y, x) * DEG;
  const lon = ((((ra - greenwichMeanSiderealTime(date)) % 360) + 540) % 360) - 180;
  return { latitude, longitude: lon };
}

/**
 * Vertical field of view (degrees, stereographic as the map) that fits a figure of angular
 * radius `radius` in a canvas of the given aspect (width / height), the figure spanning `fill`
 * of the narrow side. Bounded to [min, 150°]: small figures keep some sky around them.
 */
export function framingFov(radius: number, aspect: number, fill = 0.78, min = 20): number {
  const RAD = Math.PI / 180;
  const narrow = Math.min(1, aspect); // half-height is 1 in NDC; half-width is the aspect
  // On screen, r = 2·tan(θ/2) · scale with scale = 1 / (2·tan(fov/4)) ⇒ fov from r = fill·narrow.
  const t = Math.tan((radius * RAD) / 2) / (fill * narrow);
  const fov = (4 * Math.atan(t)) / RAD;
  return Math.min(150, Math.max(min, fov));
}

/** The other figures, nearest centre first. */
export function nearest(
  abbr: string,
  shapes: Readonly<Record<string, ConstellationShape>>,
  among: readonly string[],
): string[] {
  const from = shapes[abbr];
  if (!from) return among.filter((a) => a !== abbr);
  return among
    .filter((a) => a !== abbr && shapes[a])
    .map((a) => ({ a, d: angleBetween(from.centre, shapes[a]!.centre) }))
    .sort((p, q) => p.d - q.d)
    .map((p) => p.a);
}
