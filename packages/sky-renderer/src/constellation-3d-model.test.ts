import { describe, expect, it } from "vitest";
import {
  applyMat3,
  j2000ToHorizontalMatrix,
  julianYearsSince,
  type Mat3,
  type Vec3,
} from "@asteria/astro-core";
import {
  FIT_X,
  PARALLAX_LY,
  PHASES,
  buildConstellation3D,
  equatorialToCartesian,
  fitOrbitDistance,
  orbitCamera,
  planTransition,
  poseAt,
  projectPose,
  scaleRings,
  slerpRotation,
  stellarDistance,
} from "./constellation-3d-model";
import type { CatalogStar } from "./sky-map";
import { projectStereo, stereoScale, viewMatrix, type ViewState } from "./view";

/**
 * Hipparcos new reduction (van Leeuwen 2007, VizieR I/311) records as decoded from stars.bin:
 * positions at epoch J1991.25, parallax and its error in mas, proper motions in mas/yr.
 */
const BETELGEUSE: CatalogStar = {
  hip: 27989,
  ra: 88.79287099465728,
  dec: 7.40703699644655,
  v: 0.45,
  bv: 1.5,
  plx: 6.55,
  ePlx: 0.83,
  pmRa: 27.54,
  pmDec: 11.3,
  name: "Bételgeuse",
  con: "Ori",
};
const RIGEL: CatalogStar = {
  hip: 24436,
  ra: 78.63446401432157,
  dec: -8.201639992184937,
  v: 0.18,
  bv: -0.03,
  plx: 3.78,
  ePlx: 0.34,
  pmRa: 1.31,
  pmDec: 0.5,
  name: "Rigel",
  con: "Ori",
};
const BELLATRIX: CatalogStar = {
  hip: 25336,
  ra: 81.28278298303485,
  dec: 6.349735013209283,
  v: 1.64,
  bv: -0.224,
  plx: 12.92,
  ePlx: 0.52,
  pmRa: -8.11,
  pmDec: -12.88,
  name: "Bellatrix",
  con: "Ori",
};
/** π³ Ori (Tabit), I/311: ϖ = 123.94 ± 0.17 mas. */
const TABIT = { plx: 123.94, ePlx: 0.17 };

/**
 * SIMBAD (basic table, queried 2026-10-02 through TAP): ICRS coordinates at epoch J2000 and
 * parallax, all three from van Leeuwen 2007 (2007A&A...474..653V).
 */
const SIMBAD = {
  [BETELGEUSE.hip]: { ra: 88.79293899077537, dec: 7.407063995272694, plx: 6.55, ePlx: 0.83 },
  [RIGEL.hip]: { ra: 78.63446706693006, dec: -8.201638364722209, plx: 3.78, ePlx: 0.34 },
  [BELLATRIX.hip]: { ra: 81.28276355652378, dec: 6.3497032644440665, plx: 12.92, ePlx: 0.52 },
} as const;
/** SIMBAD's parallax of π³ Ori, Gaia DR3 (2020yCat.1350....0G): 124.6198 ± 0.2246 mas. */
const TABIT_GAIA = { plx: 124.6198, ePlx: 0.2246 };

const ORION = [BETELGEUSE, RIGEL, BELLATRIX];
const LINES = {
  Ori: [
    [27989, 25336, 24436],
    [25336, 27989],
  ],
};
const ARCSEC = 1 / 3600;

const angle = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * (180 / Math.PI);
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe("stellarDistance", () => {
  it.each(ORION.map((s) => [s.name, s] as const))(
    "%s: distance and ±1σ interval from the SIMBAD parallax",
    (_, star) => {
      const ref = SIMBAD[star.hip]!;
      const d = stellarDistance(star)!;
      // SIMBAD distance from its own parallax (same release): 1 pc = 3.261 563 777 ly.
      const simbadLy = PARALLAX_LY / ref.plx;
      // ±1σ in distance, from σϖ: the tolerance is a hundredth of it (catalogue rounding only).
      const sigmaLy = (simbadLy * ref.ePlx) / ref.plx;
      expect(Math.abs(d.ly - simbadLy)).toBeLessThan(0.01 * sigmaLy);
      expect(d.nearLy).toBeCloseTo(PARALLAX_LY / (ref.plx + ref.ePlx), 6);
      expect(d.farLy).toBeCloseTo(PARALLAX_LY / (ref.plx - ref.ePlx), 6);
      expect(d.nearLy).toBeLessThan(d.ly);
      expect(d.farLy).toBeGreaterThan(d.ly);
    },
  );

  it("gives the textbook distances of Orion's stars (light-years)", () => {
    expect(stellarDistance(BELLATRIX)!.ly).toBeCloseTo(252.4, 1);
    expect(stellarDistance(BETELGEUSE)!.ly).toBeCloseTo(497.9, 1);
    expect(stellarDistance(RIGEL)!.ly).toBeCloseTo(862.8, 1);
  });

  it("separates Bellatrix and Rigel by far more than their uncertainties", () => {
    const a = stellarDistance(BELLATRIX)!;
    const b = stellarDistance(RIGEL)!;
    expect(a.farLy).toBeLessThan(b.nearLy);
  });

  it("agrees with Gaia DR3 within 3σ for a near star (π³ Ori)", () => {
    const hip = stellarDistance(TABIT)!;
    const gaia = stellarDistance(TABIT_GAIA)!;
    const sigma = Math.hypot(TABIT.ePlx, TABIT_GAIA.ePlx); // mas, combined
    const sigmaLy = (hip.ly * sigma) / TABIT.plx;
    expect(Math.abs(hip.ly - gaia.ly)).toBeLessThan(3 * sigmaLy);
    expect(hip.ly).toBeCloseTo(26.3, 1);
  });

  it("grades the parallax quality with σϖ/ϖ", () => {
    expect(stellarDistance({ plx: 10, ePlx: 1 })!.quality).toBe("precise");
    expect(stellarDistance({ plx: 10, ePlx: 1.01 })!.quality).toBe("approx");
    expect(stellarDistance({ plx: 10, ePlx: 5 })!.quality).toBe("approx");
    const poor = stellarDistance({ plx: 0.72, ePlx: 0.62 })!;
    expect(poor.quality).toBe("uncertain");
    expect(poor.farLy).toBeCloseTo(PARALLAX_LY / 0.1, 6);
    const unbounded = stellarDistance({ plx: 0.12, ePlx: 14.62 })!;
    expect(unbounded.farLy).toBe(Infinity);
    expect(unbounded.nearLy).toBeCloseTo(PARALLAX_LY / 14.74, 6);
  });

  it("keeps only a lower bound for a non-positive parallax", () => {
    const d = stellarDistance({ plx: -0.5, ePlx: 1.5 })!;
    expect(d.ly).toBeNaN();
    expect(d.quality).toBe("uncertain");
    expect(d.nearLy).toBeCloseTo(PARALLAX_LY, 6);
    expect(stellarDistance({ plx: -2, ePlx: 1 })).toBeNull();
    expect(stellarDistance({})).toBeNull();
  });

  it("prefers a reference distance (#75)", () => {
    const deneb = stellarDistance({
      plx: 2.31,
      ePlx: 0.32,
      distanceLy: 2615,
      distanceErrorLy: 215,
      distanceSource: "Schiller & Przybilla 2008",
    })!;
    expect(deneb).toMatchObject({
      ly: 2615,
      nearLy: 2400,
      farLy: 2830,
      quality: "reference",
      source: "reference",
      distanceSource: "Schiller & Przybilla 2008",
    });
    expect(stellarDistance({ distanceLy: 100, distanceSource: "x" })!.relError).toBeNaN();
  });
});

describe("equatorialToCartesian", () => {
  it("puts RA 0 on x, RA 6h on y, the north pole on z", () => {
    const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    close(equatorialToCartesian(0, 0, 10), [10, 0, 0]);
    close(equatorialToCartesian(90, 0, 10), [0, 10, 0]);
    close(equatorialToCartesian(0, 90, 10), [0, 0, 10]);
  });

  it("places Orion's stars at their SIMBAD positions and distances (J2000)", () => {
    // The whole chain: catalogue epoch J1991.25 → proper motion to J2000 → cartesian ly.
    const years = julianYearsSince(1991.25, new Date(Date.UTC(2000, 0, 1, 12)));
    const model = buildConstellation3D(ORION, LINES, "Ori", { years });
    for (const s of model.stars) {
      const ref = SIMBAD[s.star.hip]!;
      const expected = equatorialToCartesian(ref.ra, ref.dec, PARALLAX_LY / ref.plx);
      const sigmaLy = (norm(expected) * ref.ePlx) / ref.plx;
      // Distance: within a hundredth of σ; direction: within 0.01″ of SIMBAD's J2000 position.
      expect(Math.abs(norm(s.position) - norm(expected))).toBeLessThan(0.01 * sigmaLy);
      expect(angle(s.position, expected)).toBeLessThan(0.01 * ARCSEC);
    }
  });
});

describe("buildConstellation3D", () => {
  it("keeps the figure's stars once and its segments without duplicates", () => {
    const model = buildConstellation3D(ORION, LINES, "Ori");
    expect(model.stars.map((s) => s.star.hip)).toEqual([27989, 25336, 24436]);
    expect(model.segments).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(model.stars[model.nearest]!.star.name).toBe("Bellatrix");
    expect(model.stars[model.farthest]!.star.name).toBe("Rigel");
    expect(model.limitLy).toBeCloseTo(1.25 * stellarDistance(RIGEL)!.ly, 6);
  });

  it("places uncertain stars at the scene limit, flagged", () => {
    const far: CatalogStar = { ...RIGEL, hip: 1, plx: 0.12, ePlx: 14.62 };
    const unknown: CatalogStar = { hip: 2, ra: RIGEL.ra, dec: RIGEL.dec, v: RIGEL.v, con: "Ori" };
    const model = buildConstellation3D([...ORION, far, unknown], { X: [[27989, 1, 2]] }, "X");
    const [b, f, u] = model.stars;
    expect(b!.clamped).toBe(false);
    expect(b!.uncertain).toBe(false);
    expect(f!.uncertain && f!.clamped).toBe(true);
    expect(f!.placedLy).toBeCloseTo(1.25 * stellarDistance(BETELGEUSE)!.ly, 6);
    expect(u!.distance).toBeNull();
    expect(u!.uncertain && u!.clamped).toBe(true);
    expect(norm(u!.position)).toBeCloseTo(model.limitLy, 6);
  });

  it("uses reference distances given on the side", () => {
    const refs = new Map([[RIGEL.hip, { distanceLy: 860, distanceSource: "test" }]]);
    const model = buildConstellation3D(ORION, LINES, "Ori", { references: refs });
    const rigel = model.stars.find((s) => s.star.hip === RIGEL.hip)!;
    expect(rigel.distance!.quality).toBe("reference");
    expect(norm(rigel.position)).toBeCloseTo(860, 9);
  });

  it("rotates the directions into the requested frame", () => {
    const frame: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const a = buildConstellation3D(ORION, LINES, "Ori");
    const b = buildConstellation3D(ORION, LINES, "Ori", { frame });
    a.stars.forEach((s, i) => {
      const r = applyMat3(frame, s.position);
      b.stars[i]!.position.forEach((v, k) => expect(v).toBeCloseTo(r[k]!, 6));
    });
  });
});

describe("scaleRings", () => {
  it("steps by 1-2-5 up to the farthest distance", () => {
    expect(scaleRings(1000)).toEqual([500, 1000]);
    expect(scaleRings(1080)).toEqual([500, 1000, 1500]);
    expect(scaleRings(2470)).toEqual([1000, 2000, 3000]);
    expect(scaleRings(180)).toEqual([50, 100, 150, 200]);
    expect(scaleRings(0)).toEqual([]);
  });
});

describe("transition 2D → 3D", () => {
  const date = new Date(Date.UTC(2026, 0, 15, 21));
  const observer = { latitude: 48.8566, longitude: 2.3522 };
  const frame = j2000ToHorizontalMatrix(date, observer);
  const model = buildConstellation3D(ORION, LINES, "Ori", { frame });
  const view: ViewState = { azimuth: 170, altitude: 30, fov: 90, roll: 4 };
  const aspect = 360 / 780;
  const plan = planTransition(model, view, aspect);
  const points = [[0, 0, 0] as Vec3, ...model.stars.map((s) => s.position)];
  const target = { yaw: 35, pitch: 40, distance: fitOrbitDistance(plan, points, 35, 40, aspect) };

  it("starts exactly on the sky map's stereographic projection", () => {
    const pose = poseAt(plan, 0, target);
    const m = viewMatrix(view);
    for (const s of model.stars) {
      const [x, y] = projectStereo(applyMat3(m, s.dir), stereoScale(view.fov), aspect);
      const p = projectPose(pose, s.position, aspect)!;
      expect(p.x).toBeCloseTo(x, 9);
      expect(p.y).toBeCloseTo(y, 9);
    }
  });

  it("has the camera at the Earth until the camera recedes", () => {
    const pose = poseAt(plan, PHASES.morph, target);
    expect(norm(pose.camPos)).toBeLessThan(1e-6);
    expect(pose.morph).toBe(1);
  });

  it("ends on the orbit, every star and the Earth in front and on screen", () => {
    const pose = poseAt(plan, 1, target);
    const cam = orbitCamera(plan.frame, target);
    pose.camPos.forEach((v, k) => expect(v).toBeCloseTo(cam.position[k]!, 6));
    for (const p of points) {
      const q = projectPose(pose, p, aspect)!;
      expect(q.depth).toBeGreaterThan(0);
      expect(Math.abs(q.x)).toBeLessThanOrEqual(FIT_X + 1e-6);
      expect(Math.abs(q.y - plan.shiftY)).toBeLessThanOrEqual(plan.fitY + 1e-6);
    }
  });

  it("frames the scene in the band left free by the interface", () => {
    const band = { top: 0.7, bottom: -0.3 }; // header above, a tall legend below
    const banded = planTransition(model, view, aspect, band);
    const distance = fitOrbitDistance(banded, points, 35, 40, aspect);
    const pose = poseAt(banded, 1, { yaw: 35, pitch: 40, distance });
    for (const p of points) {
      const q = projectPose(pose, p, aspect)!;
      expect(q.y).toBeLessThanOrEqual(band.top);
      expect(q.y).toBeGreaterThanOrEqual(band.bottom);
    }
    // No shift while the camera is still at the Earth (the map's projection is kept).
    expect(poseAt(banded, PHASES.morph, target).shiftY).toBe(0);
  });

  it("moves the stars continuously (no jump between frames)", () => {
    let prev = model.stars.map((s) => projectPose(poseAt(plan, 0, target), s.position, aspect)!);
    for (let t = 0.005; t <= 1.0001; t += 0.005) {
      const pose = poseAt(plan, t, target);
      const cur = model.stars.map((s) => ({ ...projectPose(pose, s.position, aspect)! }));
      cur.forEach((c, i) => {
        expect(c.depth).toBeGreaterThan(0);
        expect(Math.hypot(c.x - prev[i]!.x, c.y - prev[i]!.y)).toBeLessThan(0.08);
      });
      prev = cur;
    }
  });

  it("interpolates rotations along the shortest arc", () => {
    const a = viewMatrix({ azimuth: 10, altitude: 0, fov: 60 });
    const b = viewMatrix({ azimuth: 50, altitude: 0, fov: 60 });
    const mid = slerpRotation(a, b, 0.5);
    viewMatrix({ azimuth: 30, altitude: 0, fov: 60 }).forEach((v, k) =>
      expect(mid[k]).toBeCloseTo(v, 9),
    );
    slerpRotation(a, b, 0).forEach((v, k) => expect(v).toBeCloseTo(a[k]!, 9));
  });
});
