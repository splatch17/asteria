/**
 * Points of view of the Earth view (#128, #131): the scales and framings that turn each
 * reference frame into a scene telling one phenomenon.
 *
 * 1. "stars" — La Terre tourne: the whole Earth, the Sun's light coming from the side.
 * 2. "ecliptic" — Les saisons: a framing of the true-scale solar system on the Earth's orbit,
 *    with the equinoxes and solstices marked on it and the direction of the Earth's axis.
 * 3. "heliocentric" — Le système solaire: the true-scale solar system, from Neptune's orbit down
 *    to a planet's surface with a continuous logarithmic zoom.
 * 4. "body" — Visiter un astre (#123, body-frame.ts).
 *
 * Everything is at true scale (#131): one scene unit is the Earth's equatorial radius, the
 * Earth's centre is at the origin, the world axes are the mean equator and equinox of date. The
 * Sun and the planets are placed from their geometric heliocentric positions (astro-core
 * heliocentricPosition, tested against JPL Horizons) minus the Earth's, at their true distance,
 * and drawn with their true radii (IAU). Nothing is enlarged: what would be smaller than a few
 * pixels is found by an engraved marker of constant size on screen (markerOpacity), which fades
 * out once the true globe is large enough to be seen.
 *
 * Pure three.js maths (no renderer): unit-tested.
 */
import * as THREE from "three";
import {
  heliocentricPosition,
  type HeliocentricPosition,
  type OrbitingBody,
} from "@asteria/astro-core";
import { BODY_RADIUS_KM, EARTH_RADIUS_KM, type BodyTarget } from "./body-frame";

/** Astronomical unit, km (IAU 2012 Resolution B2). */
export const AU_KM = 149_597_870.7;

/** One astronomical unit in scene units (Earth equatorial radii): ≈ 23 454.8. */
export const AU = AU_KM / EARTH_RADIUS_KM;

/** Nominal solar radius, km (IAU 2015 Resolution B3). */
export const SUN_RADIUS_KM = 695_700;

/** Bodies of the true-scale scene. */
export type SceneBody = "Sun" | "Earth" | BodyTarget;

/**
 * The scene's bodies in drawing priority (markers and labels placed first win): the Sun, the
 * Earth, the giants, then the small planets and the Moon (a satellite: hidden first when it
 * merges with the Earth's marker).
 */
export const SCENE_BODIES: readonly SceneBody[] = [
  "Sun",
  "Earth",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Mars",
  "Venus",
  "Mercury",
  "Moon",
];

/** True radius in scene units (Earth radii): IAU 2015 nominal solar radius, IAU WGCCRE 2015. */
export function trueRadius(body: SceneBody): number {
  if (body === "Earth") return 1;
  if (body === "Sun") return SUN_RADIUS_KM / EARTH_RADIUS_KM;
  return BODY_RADIUS_KM[body] / EARTH_RADIUS_KM;
}

const scratch: { earth: HeliocentricPosition; body: HeliocentricPosition } = {
  earth: { x: 0, y: 0, z: 0, distanceAu: 0 },
  body: { x: 0, y: 0, z: 0, distanceAu: 0 },
};

/**
 * World position at `date` (scene units, the Earth's centre at the origin, equator of date) of
 * the Sun, the Earth or a planet at true scale: its geometric heliocentric position minus the
 * Earth's, in Earth radii, precessed by `prec` (J2000 → date). Allocation-free.
 */
export function trueScalePosition(
  body: "Sun" | OrbitingBody,
  date: Date,
  prec: THREE.Matrix3,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (body === "Earth") return out.set(0, 0, 0);
  const e = heliocentricPosition("Earth", date, scratch.earth);
  if (body === "Sun") out.set(-e.x, -e.y, -e.z);
  else {
    const b = heliocentricPosition(body, date, scratch.body);
    out.set(b.x - e.x, b.y - e.y, b.z - e.z);
  }
  return out.multiplyScalar(AU).applyMatrix3(prec);
}

/**
 * Apparent radius (CSS px) of a sphere of radius `r` seen from `d` (same unit) with a focal
 * length of `focalPx` px: r / √(d² − r²) · focal (the limb, not the centre plane). Infinite from
 * inside the sphere.
 */
export function apparentRadiusPx(r: number, d: number, focalPx: number): number {
  return d <= r ? Infinity : (r / Math.sqrt(d * d - r * r)) * focalPx;
}

/**
 * Apparent radius (CSS px) from which a body's true globe stands for it: its marker is gone (and
 * in the visit, its sky glyph). Shared by the visit (#123) and the true-scale scene (#131).
 */
export const GLOBE_MIN_PX = 6;

/** The marker starts to fade at this apparent radius of the true globe, CSS px. */
export const MARKER_FADE_START_PX = GLOBE_MIN_PX / 2;

/**
 * Opacity of a body's engraved marker for an apparent radius `px` of its true globe: 1 while the
 * globe is too small to be seen (≤ 3 px), 0 once it is at least GLOBE_MIN_PX, linear between.
 */
export function markerOpacity(px: number): number {
  if (!(px > MARKER_FADE_START_PX)) return 1;
  if (px >= GLOBE_MIN_PX) return 0;
  return (GLOBE_MIN_PX - px) / (GLOBE_MIN_PX - MARKER_FADE_START_PX);
}

/** A scale bar: a round length, its unit and its length on screen. */
export interface ScaleBar {
  value: number;
  unit: "km" | "au";
  px: number;
}

const NICE = [5, 2, 1] as const;

/**
 * Scale bar for `kmPerPx` km per CSS px at the target's depth: the largest round length (1, 2
 * or 5 × 10ⁿ) not longer than `maxPx`, in au from 0.1 au up, in km below. Fills `out`.
 */
export function scaleBar(kmPerPx: number, maxPx: number, out: ScaleBar): ScaleBar {
  const km = kmPerPx * maxPx;
  const au = km >= 0.1 * AU_KM;
  const length = au ? km / AU_KM : km;
  const decade = 10 ** Math.floor(Math.log10(length));
  let value = decade;
  for (const k of NICE) {
    if (k * decade <= length) {
      value = k * decade;
      break;
    }
  }
  // Rounding of 10^n (e.g. 0.30000000000000004): keep the significant digits.
  out.value = Number(value.toPrecision(6));
  out.unit = au ? "au" : "km";
  out.px = ((au ? out.value * AU_KM : out.value) / kmPerPx) | 0;
  return out;
}

/**
 * Share of the way the camera's target has travelled at the progress `k` (0 … 1) of a move
 * covering `span` (world units) while its distance to the target goes from `d0` to `d1`
 * (interpolated geometrically). Zooming in, the target arrives as the distance shrinks (the
 * same number of frames from 1 000 000 km to 100 000 km as from 100 000 km to 10 000 km);
 * zooming out, it stays put until the distance has grown. Linear when the span is small
 * against the distances. 0 at k = 0, 1 at k = 1.
 */
export function travelFraction(k: number, span: number, d0: number, d1: number): number {
  const t = Math.min(1, Math.max(0, k));
  if (!(span > 0)) return t;
  if (d1 <= d0) {
    const eps = d1 / (span + d1);
    return eps < 1 ? 1 - (eps ** t - eps) / (1 - eps) : t;
  }
  const eps = d0 / (span + d0);
  return eps < 1 ? (eps ** (1 - t) - eps) / (1 - eps) : t;
}

/**
 * Camera distance at which a scene of half-extents `halfW` (horizontal) and `halfH` (vertical),
 * in world units at the target's depth, fills `fill` of a safe area of `safeW` × `safeH` CSS px
 * in a viewport `viewportH` px tall (vertical field `fovDeg`). With `sphere`, `halfW` = `halfH`
 * is the radius of a sphere centred on the target (its limb, not its centre plane).
 */
export function fitDistance(
  halfW: number,
  halfH: number,
  fovDeg: number,
  viewportH: number,
  safeW: number,
  safeH: number,
  fill: number,
  sphere = false,
): number {
  const focal = viewportH / 2 / Math.tan((fovDeg * Math.PI) / 360);
  // Apparent half-size in px: focal·R/d (plane), or focal·R/√(d² − R²) (sphere).
  const w = Math.max(1, (fill * safeW) / 2);
  const h = Math.max(1, (fill * safeH) / 2);
  const d = focal * Math.max(halfW / w, halfH / h);
  return sphere ? Math.hypot(d, halfW) : d;
}
