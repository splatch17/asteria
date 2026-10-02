/**
 * Pure helpers of the realistic style of the space view (#55): star colours, sunlight on the
 * Moon and planets, orientation of their globes. No WebGL here, so everything is unit-tested.
 */
import { JD_J2000, julianDate, unitVector, type Planet, type Vec3 } from "@asteria/astro-core";
import { bvToTemperature } from "./star-style";

/** Rendering styles of the space view: 1-bit engraving (art direction A) or realistic. */
export const SPACE_STYLES = ["engraving", "realistic"] as const;
export type SpaceStyle = (typeof SPACE_STYLES)[number];

export function isSpaceStyle(value: unknown): value is SpaceStyle {
  return SPACE_STYLES.includes(value as SpaceStyle);
}

/**
 * CIE 1931 chromaticity of a black body, Kim et al. (2002) cubic fit of the Planckian locus,
 * valid 1667 K … 25 000 K (temperatures outside are clamped).
 */
export function planckianXy(kelvin: number): [number, number] {
  const t = Math.min(25_000, Math.max(1667, kelvin));
  const [t1, t2, t3] = [1e3 / t, 1e6 / (t * t), 1e9 / (t * t * t)];
  const x =
    t <= 4000
      ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t1 + 0.17991
      : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t1 + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

const srgbEncode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * Display colour of a star from its B−V index: black-body temperature (Ballesteros 2012) →
 * Planckian chromaticity → linear sRGB (D65), normalised so the brightest channel is 1, then
 * sRGB-encoded. Returns [r, g, b] in 0…1. Missing B−V gives a neutral white.
 */
export function bvToRgb(bv: number | undefined): Vec3 {
  if (bv === undefined || !Number.isFinite(bv)) return [1, 1, 1];
  const [x, y] = planckianXy(bvToTemperature(Math.min(2, Math.max(-0.4, bv))));
  const [X, Y, Z] = [x / y, 1, (1 - x - y) / y];
  const lin = [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ].map((c) => Math.max(0, c));
  const max = Math.max(...lin);
  return lin.map((c) => srgbEncode(c / max)) as Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

/**
 * Unit vector from a body towards the Sun, from the observer's directions and distances
 * to both (any common frame and unit): normalise(sun·dSun − body·dBody).
 */
export function sunwardDirection(body: Vec3, bodyDist: number, sun: Vec3, sunDist: number): Vec3 {
  return normalize(sub(scale(sun, sunDist), scale(body, bodyDist)));
}

/**
 * Illuminated fraction of a body's disc seen by the observer: (1 + cos i) / 2, where the phase
 * angle i is between the directions body → Sun and body → observer (= −body).
 */
export function illuminatedFraction(body: Vec3, sunward: Vec3): number {
  return (1 - dot(normalize(body), sunward)) / 2;
}

/**
 * North pole (J2000 RA/Dec, degrees) and prime meridian (W0 + Ẇ·d, degrees, d in days from
 * J2000) of the planets: IAU WGCCRE report 2015 (Archinal et al. 2018, Celest. Mech. Dyn. Astr.
 * 130:22), constant terms only (the secular and periodic terms move the pole by < 1° over
 * centuries). The prime meridians of the gas giants are conventional (System III); the
 * textures' longitudes are not tied to them, so only the poles (and Saturn's rings) are exact.
 */
export const PLANET_ROTATION: Readonly<
  Record<Planet, { ra: number; dec: number; w0: number; wDot: number }>
> = Object.freeze({
  Mercury: { ra: 281.0103, dec: 61.4155, w0: 329.5988, wDot: 6.1385108 },
  Venus: { ra: 272.76, dec: 67.16, w0: 160.2, wDot: -1.4813688 },
  Mars: { ra: 317.269202, dec: 54.432516, w0: 176.049863, wDot: 350.891982443297 },
  Jupiter: { ra: 268.056595, dec: 64.495303, w0: 284.95, wDot: 870.536 },
  Saturn: { ra: 40.589, dec: 83.537, w0: 38.9, wDot: 810.7939024 },
  Uranus: { ra: 257.311, dec: -15.175, w0: 203.81, wDot: -501.1600928 },
  Neptune: { ra: 299.36, dec: 43.46, w0: 249.978, wDot: 541.1397757 },
});

/** Mean lunar north pole (IAU WGCCRE 2015, constant terms), J2000 RA/Dec in degrees. */
export const MOON_POLE = Object.freeze({ ra: 269.9949, dec: 66.5392 });

/** Body-fixed axes in the J2000 frame: north pole and prime meridian (longitude 0). */
export interface BodyAxes {
  pole: Vec3;
  prime: Vec3;
}

/**
 * Axes of a planet at a date: the prime meridian lies at angle W, eastwards along the body's
 * equator, from the ascending node Q = ẑ × pole of that equator on the ICRF equator.
 */
export function planetAxes(planet: Planet, date: Date): BodyAxes {
  const r = PLANET_ROTATION[planet];
  const pole = unitVector(r.ra, r.dec);
  const node = normalize(cross([0, 0, 1], pole));
  const w = ((r.w0 + r.wDot * (julianDate(date) - JD_J2000)) % 360) * (Math.PI / 180);
  const quadrature = cross(pole, node);
  return {
    pole,
    prime: normalize([
      node[0] * Math.cos(w) + quadrature[0] * Math.sin(w),
      node[1] * Math.cos(w) + quadrature[1] * Math.sin(w),
      node[2] * Math.cos(w) + quadrature[2] * Math.sin(w),
    ]),
  };
}

/**
 * Axes of the Moon, which keeps its near side towards the Earth: the prime meridian points at
 * the sub-Earth point (libration, ≤ 8°, is neglected). `moon` is the direction Earth → Moon.
 */
export function moonAxes(moon: Vec3): BodyAxes {
  const pole = unitVector(MOON_POLE.ra, MOON_POLE.dec);
  const toEarth = scale(normalize(moon), -1);
  return { pole, prime: normalize(sub(toEarth, scale(pole, dot(toEarth, pole)))) };
}
