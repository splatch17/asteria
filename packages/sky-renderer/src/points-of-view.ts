/**
 * Points of view of the Earth view (#128): the scales, framings and sun-centred diagrams that
 * turn each reference frame into a scene telling one phenomenon.
 *
 * 1. "stars" — La Terre tourne: the whole Earth, the Sun's light coming from the side.
 * 2. "earth" — Vu du sol: the observer's place centred; the Sun and the Moon on their daily
 *    circles round the Earth (schematic distances).
 * 3. "ecliptic" — Les saisons: the Sun at the centre, the Earth's orbit at true shape and scale
 *    (SEASONS_SCALE Earth radii per au), the Earth enlarged (the scene's unit stays its radius).
 * 4. "heliocentric" — Le système solaire: the Sun at the centre, the planets' orbits with their
 *    distances compressed (compressedRadius) and their sizes enlarged (planetDrawRadius).
 * 5. "body" — Visiter un astre (#123, body-frame.ts): true scale.
 *
 * The scene's world frame stays the Earth view's (mean equator and equinox of date, Earth radii,
 * the Earth's centre at the origin): in the sun-centred diagrams the Earth stays at the origin
 * and the Sun's drawn position is placed from it, so that the Earth's own globe, terminator and
 * axis keep their true orientation. Heliocentric directions are kept exactly; only distances are
 * scaled (linearly for the seasons, compressed for the solar system), so the light falling on
 * every drawn body comes from the true direction of the Sun.
 *
 * Pure three.js maths (no renderer): unit-tested.
 */
import * as THREE from "three";
import {
  heliocentricPosition,
  type HeliocentricPosition,
  type OrbitingBody,
} from "@asteria/astro-core";
import { BODY_RADIUS_KM, EARTH_RADIUS_KM } from "./body-frame";

/** Astronomical unit, km (IAU 2012 B2). */
export const AU_KM = 149_597_870.7;
/**
 * "Les saisons": drawn distance of 1 au, Earth radii. The orbit keeps its true shape and its
 * true size relative to the Sun–Earth distance; the Earth (radius 1) is enlarged by
 * AU / (Earth radius × SEASONS_SCALE) ≈ 2 930 so that its axis and terminator stay visible.
 */
export const SEASONS_SCALE = 8;

/** Earth enlargement in "Les saisons" (≈ 2 932). */
export const SEASONS_EARTH_ENLARGEMENT = AU_KM / EARTH_RADIUS_KM / SEASONS_SCALE;

/**
 * "Le système solaire": a distance r (au) from the Sun is drawn at a·ln(1 + r / r0) Earth radii.
 * Logarithmic so that Mercury (0.39 au) and Neptune (30 au) fit on one phone screen with the
 * inner planets apart: Mercury 5.8, Earth 10.3, Mars 12.6, Jupiter 20.3, Neptune 32.3.
 * Monotonic and direction-preserving: the order of the planets, the angles seen from the Sun
 * and the shapes' orientation are kept, not the ratios of distances. The Sun is a glyph of
 * constant size on screen in both diagrams, not to scale.
 */
export const SOLAR_SCALE = Object.freeze({ a: 7, r0: 0.3 });

/** Drawn distance (Earth radii) of a heliocentric distance r (au) in "Le système solaire". */
export const compressedRadius = (rAu: number): number =>
  SOLAR_SCALE.a * Math.log1p(rAu / SOLAR_SCALE.r0);

/**
 * Drawn radius (Earth radii) of a planet in "Le système solaire": (R / R⊕)^¼, so the Earth keeps
 * its radius 1 and the giants are not as large as their orbits' spacing (Jupiter 1.83, Mercury
 * 0.79). Sizes are ordered as the true ones, their ratios compressed.
 */
export function planetDrawRadius(body: OrbitingBody): number {
  if (body === "Earth") return 1;
  return (BODY_RADIUS_KM[body] / EARTH_RADIUS_KM) ** 0.25;
}

export type DiagramKind = "seasons" | "solar";

/**
 * Drawn position (world, Earth radii, Sun at the origin of the diagram) of a heliocentric J2000
 * vector `h` (au): precessed to the equator of date by `prec`, then scaled (seasons) or
 * compressed (solar system). Allocation-free.
 */
export function diagramPoint(
  kind: DiagramKind,
  h: { x: number; y: number; z: number },
  prec: THREE.Matrix3,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.set(h.x, h.y, h.z).applyMatrix3(prec);
  const r = out.length();
  if (r === 0) return out;
  return out.multiplyScalar((kind === "seasons" ? SEASONS_SCALE * r : compressedRadius(r)) / r);
}

const helio: HeliocentricPosition = { x: 0, y: 0, z: 0, distanceAu: 0 };

/**
 * World position of the Sun drawn by a diagram at `date`: the Earth stays at the origin, the
 * Sun at minus the Earth's drawn heliocentric position. `prec`: J2000 → date.
 */
export function diagramSun(
  kind: DiagramKind,
  date: Date,
  prec: THREE.Matrix3,
  out: THREE.Vector3,
): THREE.Vector3 {
  return diagramPoint(kind, heliocentricPosition("Earth", date, helio), prec, out).negate();
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

/**
 * Point where the line of sight from `from` through `through` meets the sphere of radius
 * `radius` centred on the origin (the far intersection, beyond `through`): the backdrop on which
 * a planet's apparent motion is drawn. Returns false when the line does not meet it.
 */
export function lineOfSight(
  from: THREE.Vector3,
  through: THREE.Vector3,
  radius: number,
  out: THREE.Vector3,
): boolean {
  const d = out.copy(through).sub(from);
  const len = d.length();
  if (len === 0) return false;
  d.multiplyScalar(1 / len);
  const b = from.dot(d);
  const c = from.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b + Math.sqrt(disc);
  if (t <= 0) return false;
  out.multiplyScalar(t).add(from);
  return true;
}

/** Ecliptic longitude (degrees, 0 … 360) of a point in ecliptic-of-date axes. */
export const eclipticLongitude = (v: { x: number; y: number }): number =>
  ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
