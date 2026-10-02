import { describe, expect, it } from "vitest";
import {
  propagateDirections,
  propagateStar,
  starMotion,
  unitVector,
  yearsSinceHipparcos,
  type Astrometry,
  type Equatorial,
  type Vec3,
} from "./index";

const RAD = Math.PI / 180;

/** Angular separation in arcseconds (haversine: accurate for tiny angles). */
function sepArcsec(a: Equatorial, b: Equatorial): number {
  const dd = (b.dec - a.dec) * RAD;
  const da = (b.ra - a.ra) * RAD;
  const h =
    Math.sin(dd / 2) ** 2 + Math.cos(a.dec * RAD) * Math.cos(b.dec * RAD) * Math.sin(da / 2) ** 2;
  return (2 * Math.asin(Math.sqrt(h)) * 180 * 3600) / Math.PI;
}
const sepDeg = (a: Equatorial, b: Equatorial) => sepArcsec(a, b) / 3600;

const J2000 = new Date("2000-01-01T12:00:00Z");
const J2026 = new Date("2026-01-01T00:00:00Z"); // J2026.0 = J2000 + 26 × 365.25 d

// Catalogue input: Hipparcos new reduction (VizieR I/311/hip2, columns RArad, DErad, pmRA, pmDE,
// Plx), epoch J1991.25 — exactly what the app's star catalogue holds.
const HIP: Record<string, Astrometry> = {
  arcturus: { ra: 213.91811408, dec: 19.18727046, pmRa: -1093.39, pmDec: -2000.06, plx: 88.83 },
  sirius: { ra: 101.28854105, dec: -16.71314306, pmRa: -546.01, pmDec: -1223.07, plx: 379.21 },
  alphaCenA: { ra: 219.92040813, dec: -60.83514522, pmRa: -3679.25, pmDec: 473.67, plx: 754.81 },
  cyg61A: { ra: 316.71181137, dec: 38.74149513, pmRa: 4168.31, pmDec: 3269.2, plx: 286.82 },
};

// Reference: SIMBAD (sim-script, %COO(d;A D;ICRS;J2000|J2026;2000)), queried 2026-10-02.
// Arcturus, Sirius, α Cen A: SIMBAD astrometry = Hipparcos 2007 (independent propagation code).
// 61 Cyg A: SIMBAD astrometry = Gaia EDR3 (independent measurement at epoch J2016).
const SIMBAD: Record<string, { j2000: Equatorial; j2026: Equatorial }> = {
  arcturus: {
    j2000: { ra: 213.91530029, dec: 19.18240916 },
    j2026: { ra: 213.90694, dec: 19.16796392 },
  },
  sirius: {
    j2000: { ra: 101.28715533, dec: -16.71611586 },
    j2026: { ra: 101.28303751, dec: -16.72494959 },
  },
  alphaCenA: {
    j2000: { ra: 219.90205833, dec: -60.83399269 },
    j2026: { ra: 219.84752265, dec: -60.83055966 },
  },
  cyg61A: {
    j2000: { ra: 316.7247482895925, dec: 38.7494173194369 },
    j2026: { ra: 316.7633431773332, dec: 38.7728921594381 },
  },
};

describe("yearsSinceHipparcos", () => {
  it("is 8.75 at J2000.0 and 34.75 at J2026.0", () => {
    expect(yearsSinceHipparcos(J2000)).toBeCloseTo(8.75, 9);
    expect(yearsSinceHipparcos(J2026)).toBeCloseTo(34.75, 9);
  });
});

describe("propagateStar vs SIMBAD (catalogue without radial velocity)", () => {
  // Same Hipparcos astrometry: only the propagation differs (SIMBAD also uses the radial
  // velocity, worth ≤ 0.02″ here). Tolerance 0.1″.
  for (const key of ["arcturus", "sirius", "alphaCenA"] as const) {
    it(`${key} at J2000 and J2026 within 0.1″`, () => {
      const star = HIP[key]!;
      expect(
        sepArcsec(propagateStar(star, yearsSinceHipparcos(J2000)), SIMBAD[key]!.j2000),
      ).toBeLessThan(0.1);
      expect(
        sepArcsec(propagateStar(star, yearsSinceHipparcos(J2026)), SIMBAD[key]!.j2026),
      ).toBeLessThan(0.1);
    });
  }

  // Independent astrometry (Gaia), binary with a 680-year orbit: Hipparcos μ is not Gaia's μ
  // (0.17″ at J2000, 0.58″ at J2026). Tolerance 1″.
  it("61 Cyg A (μ = 5.3″/yr) at J2000 and J2026 within 1″ of Gaia", () => {
    const star = HIP.cyg61A!;
    expect(
      sepArcsec(propagateStar(star, yearsSinceHipparcos(J2000)), SIMBAD.cyg61A!.j2000),
    ).toBeLessThan(1);
    expect(
      sepArcsec(propagateStar(star, yearsSinceHipparcos(J2026)), SIMBAD.cyg61A!.j2026),
    ).toBeLessThan(1);
  });
});

describe("propagateStar with radial velocity (perspective acceleration)", () => {
  // Barnard's star (not in the V ≤ 6.5 catalogue): the largest proper motion and perspective
  // acceleration of the sky. SIMBAD J2000 → J2026 with SIMBAD's μ, ϖ, v_r (Gaia EDR3, Lindegren).
  const barnard: Astrometry = {
    ra: 269.4520769586187,
    dec: 4.6933649665767,
    pmRa: -801.551,
    pmDec: 10362.394,
    plx: 546.9759,
    radialVelocity: -110.11,
  };
  const simbadJ2026 = { ra: 269.4462585606824, dec: 4.768324457849 };

  it("matches SIMBAD's rigorous propagation within 0.005″ over 26 years", () => {
    expect(sepArcsec(propagateStar(barnard, 26), simbadJ2026)).toBeLessThan(0.005);
  });

  it("the radial velocity term is real: ignoring it misses by > 0.3″", () => {
    const noRv = { ...barnard, radialVelocity: 0 };
    expect(sepArcsec(propagateStar(noRv, 26), simbadJ2026)).toBeGreaterThan(0.3);
  });
});

describe("long-term coherence (±13 000 years)", () => {
  it("without v_r the star moves on a great circle by atan(μ t), symmetric in time", () => {
    const s = HIP.arcturus!;
    const mu = Math.hypot(s.pmRa!, s.pmDec!) / 3_600_000; // °/yr
    const expected = Math.atan(mu * RAD * 13_000) / RAD; // 8.175°
    for (const t of [13_000, -13_000]) {
      expect(Math.abs(sepDeg(propagateStar(s, t), s) - expected)).toBeLessThan(1e-9);
    }
    // Great circle: the midpoint of ±t is the epoch position.
    const p = propagateStar(s, 13_000);
    const m = propagateStar(s, -13_000);
    const a = unitVector(p.ra, p.dec);
    const b = unitVector(m.ra, m.dec);
    const mid: Equatorial = {
      ra: (Math.atan2(a[1] + b[1], a[0] + b[0]) / RAD + 360) % 360,
      dec: Math.atan2(a[2] + b[2], Math.hypot(a[0] + b[0], a[1] + b[1])) / RAD,
    };
    expect(sepArcsec(mid, s)).toBeLessThan(1e-6);
  });

  it("orders of magnitude of the 13 000-year displacements", () => {
    // Arcturus ~8°, Sirius ~5°, α Cen ~13° (review figures).
    expect(sepDeg(propagateStar(HIP.arcturus!, 13_000), HIP.arcturus!)).toBeCloseTo(8.18, 1);
    expect(sepDeg(propagateStar(HIP.sirius!, 13_000), HIP.sirius!)).toBeCloseTo(4.83, 1);
    expect(sepDeg(propagateStar(HIP.alphaCenA!, 13_000), HIP.alphaCenA!)).toBeCloseTo(13.16, 1);
  });

  it("documented limit: v_r shifts α Cen A by ~3.4° at +13 000 years, Arcturus by 0.05°", () => {
    const at = (s: Astrometry, rv: number) => propagateStar({ ...s, radialVelocity: rv }, 13_000);
    // Radial velocities: SIMBAD (α Cen A −21.4 km/s rounded, Arcturus −5.2 km/s).
    const cen = sepDeg(at(HIP.alphaCenA!, -21.4), at(HIP.alphaCenA!, 0));
    expect(cen).toBeGreaterThan(3);
    expect(cen).toBeLessThan(4);
    expect(sepDeg(at(HIP.arcturus!, -5.2), at(HIP.arcturus!, 0))).toBeLessThan(0.06);
  });

  it("no proper motion: the position does not move", () => {
    const s = { ra: 10, dec: 20 };
    const p = propagateStar(s, 13_000);
    expect(sepArcsec(p, s)).toBeLessThan(1e-6);
  });
});

describe("propagateDirections (CPU twin of the shaders)", () => {
  const stars = Object.values(HIP);
  const motion = starMotion(stars);

  for (const t of [0, 35, 13_000, -13_000]) {
    it(`matches propagateStar at t = ${t} yr within float32 precision (0.05″)`, () => {
      const packed = new Float32Array(stars.length * 3);
      propagateDirections(motion, t, packed);
      const vecs: Vec3[] = stars.map(() => [0, 0, 0]);
      propagateDirections(motion, t, vecs);
      stars.forEach((s, i) => {
        const ref = propagateStar(s, t);
        const [x, y, z] = vecs[i]!;
        expect(packed[3 * i]).toBeCloseTo(x, 6);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        const got = { ra: (Math.atan2(y, x) / RAD + 360) % 360, dec: Math.asin(z) / RAD };
        expect(sepArcsec(got, ref)).toBeLessThan(0.05);
      });
    });
  }
});
