/**
 * Geometry of the latitude explorer (#188): the celestial sphere seen from outside around an
 * observer on a flat horizon disc, and the flat all-sky map in the equator of date. Pure maths,
 * no canvas, so that it can be tested.
 *
 * Frames:
 *  - equator of date: x towards the equinox of date, z towards the north celestial pole
 *    (J2000 directions times `precessionMatrix(date)`);
 *  - horizon (ENU): e east, n north, u up (right-handed: e × n = u), the observer at the centre,
 *    the horizon disc of radius 1 in the plane u = 0;
 *  - camera: orthographic, looking at the centre from direction `c` (unit), screen right `r`,
 *    screen up `s`; a direction p lands at (p·r, p·s) in units of the sphere's radius, in front
 *    when p·c > 0.
 */
import type { Mat3, Vec3 } from "@asteria/astro-core";

const RAD = Math.PI / 180;

/**
 * Equator of date → horizon (ENU) at latitude `lat` (degrees) and local sidereal time `lst`
 * (degrees). A direction of hour angle h = lst − α and declination δ lands at
 * e = −cos δ sin h, n = cos φ sin δ − sin φ cos δ cos h, u = sin φ sin δ + cos φ cos δ cos h.
 */
export function equatorToHorizon(lat: number, lst: number): Mat3 {
  const [sp, cp] = [Math.sin(lat * RAD), Math.cos(lat * RAD)];
  const [st, ct] = [Math.sin(lst * RAD), Math.cos(lst * RAD)];
  // Rows: e, n, u of (x, y, z) after the rotation by −lst about z (x′ = cos h·cos δ …).
  return [
    -st, ct, 0,
    -sp * ct, -sp * st, cp,
    cp * ct, cp * st, sp,
  ]; // prettier-ignore
}

/** North celestial pole in the horizon frame (ENU): up at altitude φ above the north point. */
export const celestialPole = (lat: number): Vec3 => [0, Math.cos(lat * RAD), Math.sin(lat * RAD)];

/** Orthographic camera around the sphere (ENU). */
export interface SphereCamera {
  /** Unit vector from the centre towards the camera. */
  c: Vec3;
  /** Screen right and up (unit, orthogonal to c). */
  r: Vec3;
  s: Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * Camera seen from azimuth `azimuth` (degrees from north through east) and `elevation` above the
 * horizon plane, its up vector as close to the zenith as it can be. From the west (azimuth 270°)
 * the north point is on the left of the screen.
 */
export function sphereCamera(azimuth: number, elevation: number): SphereCamera {
  const [a, e] = [azimuth * RAD, elevation * RAD];
  const c: Vec3 = [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
  const r = normalize(cross([0, 0, 1], c));
  const s = cross(c, r);
  return { c, r, s };
}

/** Screen position (x right, y up, sphere radius 1) and depth (> 0: in front) of a point. */
export function projectSphere(cam: SphereCamera, p: Vec3): { x: number; y: number; z: number } {
  return { x: dot(p, cam.r), y: dot(p, cam.s), z: dot(p, cam.c) };
}

/**
 * The opaque horizon disc (u = 0, radius 1) hides the point from the camera: the segment from
 * the point towards the camera crosses the plane inside the disc. Points on or above the plane
 * are never hidden when the camera looks from above.
 */
export function hiddenByGround(cam: SphereCamera, p: Vec3): boolean {
  if (cam.c[2] <= 0 || p[2] >= -1e-9) return false;
  const t = -p[2] / cam.c[2];
  const x = p[0] + t * cam.c[0];
  const y = p[1] + t * cam.c[1];
  return x * x + y * y <= 1 + 1e-9;
}

/**
 * A circle of the sphere: the parallel of declination `dec` (degrees) about the axis `pole`
 * (unit), as `n` + 1 points (closed), starting from the side of `start` (any direction not
 * along the axis).
 */
export function parallelCircle(pole: Vec3, dec: number, n = 96, start: Vec3 = [1, 0, 0]): Vec3[] {
  const a = normalize(cross(cross(pole, start), pole));
  const b = cross(pole, a);
  const [sd, cd] = [Math.sin(dec * RAD), Math.cos(dec * RAD)];
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / n;
    const [ct, st] = [Math.cos(t), Math.sin(t)];
    out.push([
      pole[0] * sd + cd * (a[0] * ct + b[0] * st),
      pole[1] * sd + cd * (a[1] * ct + b[1] * st),
      pole[2] * sd + cd * (a[2] * ct + b[2] * st),
    ]);
  }
  return out;
}

/** How a point of the sphere (or inside it) shows on the picture. */
export type Visibility = "front" | "back" | "hidden";

/** Front of the sphere, back of it seen through the glass, or behind the horizon disc. */
export function visibilityOf(cam: SphereCamera, p: Vec3): Visibility {
  if (hiddenByGround(cam, p)) return "hidden";
  return dot(p, cam.c) >= 0 ? "front" : "back";
}

// --- Flat map -------------------------------------------------------------------------------

/**
 * Equirectangular map of the equator of date, `width` × `height`: right ascension grows to the
 * left as on a sky chart (0 h on the right edge, 24 h on the left), declination +90° at the top.
 */
export interface MapFrame {
  width: number;
  height: number;
}

export const mapX = (f: MapFrame, ra: number): number => (1 - ra / 360) * f.width;
export const mapY = (f: MapFrame, dec: number): number => ((90 - dec) / 180) * f.height;
/** Right ascension (degrees, [0, 360)) and declination under a map point. */
export function mapRaDec(f: MapFrame, x: number, y: number): { ra: number; dec: number } {
  const ra = ((((1 - x / f.width) * 360) % 360) + 360) % 360;
  const dec = Math.max(-90, Math.min(90, 90 - (y / f.height) * 180));
  return { ra, dec };
}

/** Right ascension and declination of date (degrees) of a unit vector of the equator of date. */
export function raDecOf(v: Vec3): { ra: number; dec: number } {
  const ra = Math.atan2(v[1], v[0]) / RAD;
  return { ra: ra < 0 ? ra + 360 : ra, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD };
}

/**
 * A closed ring of the sky (RA/Dec of date, degrees) as a polygon of the map with continuous x:
 * x may run past the edges (the caller draws it again shifted by ± width). A ring around a
 * celestial pole (its right ascension winds once) is closed along the top or bottom edge, so
 * that its fill covers the pole.
 */
export function unwrapRing(
  f: MapFrame,
  ring: readonly { ra: number; dec: number }[],
): [number, number][] {
  const out: [number, number][] = [];
  if (!ring.length) return out;
  let ra = ring[0]!.ra;
  let wind = 0;
  out.push([mapX(f, ra), mapY(f, ring[0]!.dec)]);
  for (let i = 1; i < ring.length; i++) {
    const step = ((((ring[i]!.ra - ring[i - 1]!.ra + 180) % 360) + 360) % 360) - 180;
    ra += step;
    wind += step;
    out.push([mapX(f, ra), mapY(f, ring[i]!.dec)]);
  }
  if (Math.abs(wind) > 180) {
    // Around a pole: which one is the mean declination's side.
    const mean = ring.reduce((s, p) => s + p.dec, 0) / ring.length;
    const y = mean > 0 ? 0 : f.height;
    const last = out[out.length - 1]!;
    out.push([last[0], y], [out[0]![0], y]);
  }
  return out;
}

/**
 * A segment between two directions of date on the map, split where it crosses the 0 h edge:
 * one or two pieces, each with x inside [0, width] (great-circle segments of the figures are
 * short, drawn straight in the map).
 */
export function mapSegment(
  f: MapFrame,
  a: { ra: number; dec: number },
  b: { ra: number; dec: number },
): [number, number, number, number][] {
  const step = ((((b.ra - a.ra + 180) % 360) + 360) % 360) - 180;
  const [x0, y0] = [mapX(f, a.ra), mapY(f, a.dec)];
  const x1 = x0 - (step / 360) * f.width;
  const y1 = mapY(f, b.dec);
  if (x1 >= 0 && x1 <= f.width) return [[x0, y0, x1, y1]];
  const edge = x1 < 0 ? 0 : f.width;
  const t = (edge - x0) / (x1 - x0);
  const ym = y0 + (y1 - y0) * t;
  const other = edge === 0 ? f.width : 0;
  return [
    [x0, y0, edge, ym],
    [other, ym, x1 + (other - edge), y1],
  ];
}

// --- Latitude sweep ------------------------------------------------------------------------

/**
 * The « play » sweep from pole to pole: latitude = 90° · cos(phase), slow at the poles and
 * fastest over the equator. Phase advances by 2π per `period` ms; `phaseOf` gives the phase that
 * starts at a latitude, heading south (true) or north.
 */
export const sweepLatitude = (phase: number): number => 90 * Math.cos(phase);
export function phaseOf(lat: number, south = true): number {
  const p = Math.acos(Math.max(-1, Math.min(1, lat / 90)));
  return south ? p : 2 * Math.PI - p;
}
