/**
 * Titan, Saturn's largest moon (#148): its position around Saturn from the theory of Meeus,
 * *Astronomical Algorithms* (2nd ed., 1998), chapter 46 (after Dourneau 1987), accurate to a few
 * hundredths of a Saturn radius (≈ 0.1″ seen from the Earth). Titan reaches magnitude ≈ 8.3, up to
 * ≈ 3′ from Saturn: a pair of binoculars or a small telescope shows it.
 *
 * The theory gives Titan's orbit on Saturn's equator, turned here into a Saturn-centred vector on
 * the mean ecliptic and equinox of B1950.0 (Meeus 46, before the projection on the sky), then into
 * the J2000 mean equator of the rest of the app.
 */

import * as Astronomy from "astronomy-engine";

const D = Math.PI / 180;
/** Saturn's equator on the B1950.0 ecliptic: inclination and node (Meeus 46). */
const INCL = 28.0817 * D;
const NODE = 168.8112 * D;
/** Titan's semi-major axis: 20.216193 Saturn radii in the theory, 1 221 870 km (NASA). */
const A_RADII = 20.216193;
const A_KM = 1_221_870;
export const SATURN_RADIUS_KM = A_KM / A_RADII;
/** B1950.0 (Besselian), Julian ephemeris date. */
const JDE_B1950 = 2_433_282.4235;
const JDE_J2000 = 2_451_545.0;

/** Saturn-centred vector (units given by each function). */
export interface SaturnCentred {
  x: number;
  y: number;
  z: number;
}

/**
 * Titan's Saturn-centred position at a Julian ephemeris date, on the mean ecliptic and equinox of
 * B1950.0, in Saturn radii (Meeus 46: Titan's elements, then the rotation from Saturn's equator).
 */
export function titanEclipticB1950(jde: number): SaturnCentred {
  const t4 = jde - 2_411_368;
  const t5 = t4 / 365.25;
  const t6 = jde - 2_415_020;
  const t7 = t6 / 36_525;
  const W3 = 42 * D - 0.5118 * D * t5;
  const W4 = 276.59 * D + 0.5118 * D * t5;
  const W5 = 267.2635 * D + 1222.1136 * D * t7;
  const W6 = 175.4762 * D + 1221.5515 * D * t7;
  const W7 = 2.4891 * D + 0.002435 * D * t7;
  const W8 = 113.35 * D - 0.2597 * D * t7;
  const e1 = 0.05589 - 0.000346 * t7;
  const [s1, c1] = [Math.sin(INCL), Math.cos(INCL)];

  const L = 261.1582 * D + 22.57697855 * D * t4 + 0.074025 * D * Math.sin(W3);
  const iP = 27.45141 * D + 0.295999 * D * Math.cos(W3);
  const nodeP = 168.66925 * D + 0.628808 * D * Math.sin(W3);
  const a1 = Math.sin(W7) * Math.sin(nodeP - W8);
  const a2 = Math.cos(W7) * Math.sin(iP) - Math.sin(W7) * Math.cos(iP) * Math.cos(nodeP - W8);
  const g0 = 102.8623 * D;
  const psi = Math.atan2(a1, a2);
  const s = Math.hypot(a1, a2);
  let g = W4 - nodeP - psi;
  let peri = 0;
  for (let k = 0; k < 3; k++) {
    peri = W4 + 0.37515 * D * (Math.sin(2 * g) - Math.sin(2 * g0));
    g = peri - nodeP - psi;
  }
  const eP = 0.029092 + 0.00019048 * (Math.cos(2 * g) - Math.cos(2 * g0));
  const q = 2 * (W5 - peri);
  const b1 = Math.sin(iP) * Math.sin(nodeP - W8);
  const b2 = Math.cos(W7) * Math.sin(iP) * Math.cos(nodeP - W8) - Math.sin(W7) * Math.cos(iP);
  const theta = Math.atan2(b1, b2) + W8;
  const e = eP + 0.002778797 * eP * Math.cos(q);
  const p = peri + 0.159215 * D * Math.sin(q);
  const u0 = 2 * W5 - 2 * theta + psi;
  const h = 0.9375 * eP * eP * Math.sin(q) + 0.1875 * s * s * Math.sin(2 * (W5 - theta));
  const lambdaP = L - 0.254744 * D * (e1 * Math.sin(W6) + 0.75 * e1 * e1 * Math.sin(2 * W6) + h);
  const i = iP + 0.031843 * D * s * Math.cos(u0);
  const node = nodeP + (0.031843 * D * s * Math.sin(u0)) / Math.sin(iP);

  // Meeus 46, "subr": equation of the centre, then the orbit referred to Saturn's equator.
  const M = lambdaP - p;
  const e2 = e * e;
  const e3 = e2 * e;
  const e4 = e2 * e2;
  const e5 = e3 * e2;
  const C =
    (2 * e - 0.25 * e3 + 0.0520833333 * e5) * Math.sin(M) +
    (1.25 * e2 - 0.458333333 * e4) * Math.sin(2 * M) +
    (1.083333333 * e3 - 0.671875 * e5) * Math.sin(3 * M) +
    1.072917 * e4 * Math.sin(4 * M) +
    1.142708 * e5 * Math.sin(5 * M);
  const r = (A_RADII * (1 - e2)) / (1 + e * Math.cos(M + C));
  const gg = node - NODE;
  const c1x = Math.sin(i) * Math.sin(gg);
  const c2x = c1 * Math.sin(i) * Math.cos(gg) - s1 * Math.cos(i);
  const gamma = Math.asin(Math.hypot(c1x, c2x));
  const uu = Math.atan2(c1x, c2x);
  const Omega = NODE + uu;
  const hh = c1 * Math.sin(i) - s1 * Math.cos(i) * Math.cos(gg);
  const psi2 = Math.atan2(s1 * Math.sin(gg), hh);
  const lambda = lambdaP + C + uu - gg - psi2;

  // Orbit → Saturn's equatorial frame (x towards the node of the equator on the ecliptic)…
  const u = lambda - Omega;
  const w = Omega - NODE;
  const X = r * (Math.cos(u) * Math.cos(w) - Math.sin(u) * Math.cos(gamma) * Math.sin(w));
  const Y = r * (Math.sin(u) * Math.cos(w) * Math.cos(gamma) + Math.cos(u) * Math.sin(w));
  const Z = r * Math.sin(u) * Math.sin(gamma);
  // …→ B1950.0 ecliptic: tilt by Saturn's equator inclination, then turn by its node.
  const a = X;
  const b = c1 * Y - s1 * Z;
  const c = s1 * Y + c1 * Z;
  return {
    x: Math.cos(NODE) * a - Math.sin(NODE) * b,
    y: Math.sin(NODE) * a + Math.cos(NODE) * b,
    z: c,
  };
}

const B1950_TO_J2000 = (() => {
  const t = Astronomy.MakeTime(JDE_B1950 - JDE_J2000);
  return Astronomy.CombineRotation(Astronomy.Rotation_ECT_EQD(t), Astronomy.Rotation_EQD_EQJ(t));
})();

/** Titan's position relative to Saturn on the J2000 mean equator, km. */
export function titanFromSaturnJ2000(jde: number): SaturnCentred {
  const v = titanEclipticB1950(jde);
  const k = SATURN_RADIUS_KM;
  const t = Astronomy.MakeTime(jde - JDE_J2000);
  const r = Astronomy.RotateVector(
    B1950_TO_J2000,
    new Astronomy.Vector(v.x * k, v.y * k, v.z * k, t),
  );
  return { x: r.x, y: r.y, z: r.z };
}

/**
 * Astrometric geocentric J2000 right ascension / declination (degrees) and distance (km) of
 * Titan at `date`: Saturn seen with its light time, plus Titan where it was when that light left.
 */
export function titanPosition(date: Date): { ra: number; dec: number; distanceKm: number } {
  const saturn = Astronomy.GeoVector(Astronomy.Body.Saturn, date, false);
  const au = Astronomy.KM_PER_AU;
  const lightDays = saturn.Length() / 173.1446326846693;
  const jde = JDE_J2000 + Astronomy.MakeTime(date).tt - lightDays;
  const t = titanFromSaturnJ2000(jde);
  const x = saturn.x * au + t.x;
  const y = saturn.y * au + t.y;
  const z = saturn.z * au + t.z;
  const distanceKm = Math.hypot(x, y, z);
  const ra = (((Math.atan2(y, x) / D) % 360) + 360) % 360;
  return { ra, dec: Math.asin(z / distanceKm) / D, distanceKm };
}
