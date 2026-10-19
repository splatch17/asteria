import { describe, expect, it } from "vitest";
import {
  applyMat3,
  constellationOf,
  j2000ToHorizontalMatrix,
  precessionMatrix,
  multiplyMat3,
  unitVector,
  type Mat3,
  type Vec3,
} from "@asteria/astro-core";
import {
  J2000_TO_GALACTIC,
  MILKY_WAY_GLSL,
  MILKY_WAY_STYLE,
  milkyWayFrag,
  milkyWayOpacity,
  milkyWayStrength,
  milkyWayUv,
  spaceMilkyWayFrag,
  spaceMilkyWayVert,
} from "./milky-way";
import { skyStarVert } from "./space-shaders";
import { projectStereo, stereoScale, unprojectStereo, viewMatrix } from "./view";

const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Galactic centre and north galactic pole, ICRS (J2000): ESA 1997, The Hipparcos and Tycho
// Catalogues, vol. 1, §1.5.3 (also SIMBAD's galactic frame). Tolerance 1e-6 in u and v, i.e.
// 0.00036° in RA and 0.00018° in Dec, far below a texel (0.35°).
const GC = { ra: 266.40499, dec: -28.93617 };
const NGP = { ra: 192.85948, dec: 27.12825 };
const TOL = 6;

describe("milkyWayUv", () => {
  it("puts the galactic centre and pole where build_milkyway.py writes them", () => {
    const [u, v] = milkyWayUv(unitVector(GC.ra, GC.dec));
    expect(u).toBeCloseTo(GC.ra / 360, TOL);
    expect(v).toBeCloseTo((90 - GC.dec) / 180, TOL);
    const [up, vp] = milkyWayUv(unitVector(NGP.ra, NGP.dec));
    expect(up).toBeCloseTo(NGP.ra / 360, TOL);
    expect(vp).toBeCloseTo((90 - NGP.dec) / 180, TOL);
    // Texels of the 1024 × 512 texture (column = floor(u · W), row = floor(v · H)).
    expect([Math.floor(u * 1024), Math.floor(v * 512)]).toEqual([757, 338]);
  });

  it("wraps the right ascension in [0, 1) and maps the poles to the edges", () => {
    const [u1] = milkyWayUv(unitVector(359.9, 10));
    const [u2] = milkyWayUv(unitVector(0.1, 10));
    expect(u1).toBeCloseTo(359.9 / 360, 9);
    expect(u2).toBeCloseTo(0.1 / 360, 9);
    expect(milkyWayUv(unitVector(0, 0))[0]).toBe(0);
    expect(milkyWayUv(unitVector(180, 0))[0]).toBeCloseTo(0.5, 12);
    expect(milkyWayUv([0, 0, 1])[1]).toBe(0);
    expect(milkyWayUv([0, 0, -1])[1]).toBe(1);
    // A direction a hair outside the unit sphere (float error) stays at the pole.
    expect(milkyWayUv([0, 0, 1.0000001])[1]).toBe(0);
  });

  it("matches the stars' frame through the map's projection, as the shader inverts it", () => {
    // Paris, 2026-08-15 20:30 UTC (22:30 local): the forward chain of starVert (uEq2Hor, uView,
    // projectView) and the inverse chain of milkyWayFrag (unproject, uViewInv, uEq2Hor ᵀ) must
    // give back the same J2000 direction anywhere on screen.
    const eq2hor = j2000ToHorizontalMatrix(new Date("2026-08-15T20:30:00Z"), {
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const deneb = unitVector(310.358, 45.28);
    const h = applyMat3(eq2hor, deneb);
    const view = viewMatrix({
      azimuth: toDeg(Math.atan2(h[1], h[0])) + 20,
      altitude: toDeg(Math.asin(h[2])) - 10,
      fov: 90,
      roll: 15,
    });
    const scale = stereoScale(90);
    const aspect = 360 / 780;
    for (const dir of [deneb, unitVector(GC.ra, GC.dec), unitVector(297.7, 8.87)]) {
      const v = applyMat3(multiplyMat3(view, eq2hor), dir);
      if (v[2] < -0.5) continue; // behind the viewer
      const [nx, ny] = projectStereo(v, scale, aspect);
      const back = unprojectStereo(nx, ny, scale, aspect);
      const e: Vec3 = applyMat3(transpose(eq2hor), applyMat3(transpose(view), back));
      const [u, w] = milkyWayUv(e);
      const [u0, w0] = milkyWayUv(dir);
      expect(u).toBeCloseTo(u0, 9);
      expect(w).toBeCloseTo(w0, 9);
    }
  });

  it("is the formula of the shaders (atan2 / τ wrapped, 0.5 − asin / π)", () => {
    expect(milkyWayFrag).toContain("vec3 e = h * uEq2Hor;"); // Mᵀ h: horizontal → J2000
    expect(MILKY_WAY_GLSL).toContain(
      "vec2(fract(atan(e.y, e.x) / MW_TAU), 0.5 - asin(clamp(e.z, -1.0, 1.0)) / MW_PI)",
    );
    expect(milkyWayFrag).toContain("milkyWayDensity(e)");
    expect(spaceMilkyWayFrag).toContain("milkyWayDensity(normalize(vDir))");
  });
});

describe("space view orientation (#168)", () => {
  const galactic = (l: number, b: number): Vec3 => {
    const g = unitVector(l, b);
    return applyMat3(transpose(J2000_TO_GALACTIC), g);
  };
  const toRaDec = ([x, y, z]: Vec3) => ({
    ra: (toDeg(Math.atan2(y, x)) + 360) % 360,
    dec: toDeg(Math.asin(z)),
  });

  it("uses a rotation whose galactic centre and pole are the IAU ones, in Sagittarius", () => {
    const gc = toRaDec(galactic(0, 0));
    expect(gc.ra).toBeCloseTo(GC.ra, 3);
    expect(gc.dec).toBeCloseTo(GC.dec, 3);
    const ngp = toRaDec(galactic(0, 90));
    expect(ngp.ra).toBeCloseTo(NGP.ra, 3);
    expect(ngp.dec).toBeCloseTo(NGP.dec, 3);
    expect(constellationOf(gc.ra, gc.dec)).toBe("Sgr");
    expect(constellationOf(toRaDec(galactic(80, 0)).ra, toRaDec(galactic(80, 0)).dec)).toBe("Cyg");
    // Orthonormal: Mᵀ M = I.
    const m = multiplyMat3(transpose(J2000_TO_GALACTIC), J2000_TO_GALACTIC);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 9));
  });

  it("places the band with the stars' precession and samples it at their J2000 direction", () => {
    // The sphere's vertex is a J2000 direction placed by uPrec, exactly like a star.
    expect(spaceMilkyWayVert).toContain("uPrec * position");
    expect(skyStarVert).toContain("uPrec * starDirection(aDir)");
    expect(spaceMilkyWayFrag).toContain("milkyWayGlow(d)");
    // A pixel showing the galactic centre in 2026 (world = precession · J2000) reads the
    // texture at the galactic centre's texel; precession has moved it by ≈ 0.36°.
    const prec = precessionMatrix(new Date("2026-08-15T20:30:00Z"));
    const world = applyMat3(prec, unitVector(GC.ra, GC.dec));
    const [u, v] = milkyWayUv(applyMat3(transpose(prec), world));
    expect(u).toBeCloseTo(GC.ra / 360, TOL);
    expect(v).toBeCloseTo((90 - GC.dec) / 180, TOL);
    const g0 = unitVector(GC.ra, GC.dec);
    const shift = toDeg(Math.acos(world[0] * g0[0] + world[1] * g0[1] + world[2] * g0[2]));
    expect(shift).toBeGreaterThan(0.3);
    expect(shift).toBeLessThan(0.45);
  });
});

describe("milkyWayStrength", () => {
  it("is full at night in wide fields and gone in full daylight", () => {
    expect(milkyWayStrength(100, 0)).toBe(MILKY_WAY_STYLE.STRENGTH);
    expect(milkyWayStrength(100, 1)).toBe(0);
    expect(milkyWayStrength(100, 0.5)).toBeLessThan(MILKY_WAY_STYLE.STRENGTH / 2);
    expect(milkyWayStrength(2, 0)).toBeCloseTo(
      MILKY_WAY_STYLE.STRENGTH * MILKY_WAY_STYLE.MIN_OPACITY,
      12,
    );
  });
});

describe("milkyWayOpacity", () => {
  it("is full in wide fields and fades when zooming in, never to zero", () => {
    const [narrow, wide] = MILKY_WAY_STYLE.FADE_FOV;
    expect(milkyWayOpacity(100)).toBe(1);
    expect(milkyWayOpacity(wide)).toBe(1);
    expect(milkyWayOpacity(narrow)).toBe(MILKY_WAY_STYLE.MIN_OPACITY);
    expect(milkyWayOpacity(0.5)).toBe(MILKY_WAY_STYLE.MIN_OPACITY);
    let prev = 0;
    for (let fov = 0.5; fov < 30; fov += 0.5) {
      const o = milkyWayOpacity(fov);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });
});
