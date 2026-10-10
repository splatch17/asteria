import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";
import {
  bodyPath,
  bodyPosition,
  constellationOf,
  geocentricPosition,
  moonPhase,
  subsolarPoint,
} from "./index";

// Reference: JPL Horizons, observer Paris (2.3522°E, 48.8566°N, 35 m), 2026-10-01 00:00 UT.
// Quantities 1 (astrometric RA/Dec J2000), 4 (airless azimuth/elevation), 10 (illuminated %).
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const DATE = new Date("2026-10-01T00:00:00Z");

describe("bodyPosition vs JPL Horizons", () => {
  it("Sun within 0.01°", () => {
    const sun = bodyPosition("Sun", DATE, PARIS);
    expect(Math.abs(sun.ra - 186.85884466)).toBeLessThan(0.01);
    expect(Math.abs(sun.dec - -2.964574987)).toBeLessThan(0.01);
    expect(Math.abs(sun.azimuth - 6.813529467)).toBeLessThan(0.01);
    expect(Math.abs(sun.altitude - -44.063121994)).toBeLessThan(0.01);
  });

  it("Moon (topocentric) within 0.02°", () => {
    const moon = bodyPosition("Moon", DATE, PARIS);
    expect(Math.abs(moon.ra - 60.974531838)).toBeLessThan(0.02);
    expect(Math.abs(moon.dec - 25.425071115)).toBeLessThan(0.02);
    expect(Math.abs(moon.azimuth - 103.170442798)).toBeLessThan(0.02);
    expect(Math.abs(moon.altitude - 45.360578138)).toBeLessThan(0.02);
  });
});

describe("moonPhase", () => {
  it("matches Horizons illumination (77.62 %) within 0.5 %", () => {
    expect(Math.abs(moonPhase(DATE).illumination - 0.7762)).toBeLessThan(0.005);
  });
});

describe("subsolarPoint", () => {
  it("puts the Sun at the zenith there", () => {
    const p = subsolarPoint(DATE);
    expect(bodyPosition("Sun", DATE, p).altitude).toBeGreaterThan(89.9);
  });
});

describe("planets vs JPL Horizons (Paris, 2026-10-01 0 h UT)", () => {
  // RA/Dec astrometric J2000, apparent magnitude, distance (au) — Horizons quantities 1, 9, 20
  const REF = {
    Mars: { ra: 123.786393913, dec: 20.853191985, mag: 1.097, au: 1.66543730787509 },
    Jupiter: { ra: 141.834286135, dec: 15.624165707, mag: -1.871, au: 5.92083936263814 },
    Venus: { ra: 213.214738701, dec: -20.850372721, mag: -4.768, au: 0.34769571079072 },
  } as const;
  const AU = 149_597_870.7;

  it.each(Object.entries(REF))(
    "%s position < 0.01°, magnitude ± 0.1, distance ± 0.1 %%",
    (name, ref) => {
      const p = bodyPosition(name as keyof typeof REF, DATE, PARIS);
      expect(Math.abs(p.ra - ref.ra)).toBeLessThan(0.01);
      expect(Math.abs(p.dec - ref.dec)).toBeLessThan(0.01);
      expect(Math.abs(p.magnitude - ref.mag)).toBeLessThan(0.1);
      expect(Math.abs(p.distanceKm / AU - ref.au) / ref.au).toBeLessThan(0.001);
    },
  );
});

describe("bodyPath", () => {
  it("samples the requested period and shows Mars' retrograde motion in early 2027", () => {
    const path = bodyPath("Mars", new Date("2026-12-01"), new Date("2027-05-01"), 5, PARIS);
    expect(path.length).toBe(31);
    // Mars opposition: 2027-02-19 — RA decreases for some weeks around it (retrograde)
    const ras = path.map((p) => p.ra);
    const retro = ras.some((ra, i) => i > 0 && ra < ras[i - 1]!);
    expect(retro).toBe(true);
  });
});

describe("constellationOf (IAU boundaries, Roman 1987)", () => {
  // J2000 positions from SIMBAD.
  it.each([
    ["Betelgeuse", 88.792939, 7.407064, "Ori"],
    ["Vega", 279.234735, 38.783689, "Lyr"],
    ["Polaris", 37.954561, 89.264109, "UMi"],
    ["Sirius", 101.287155, -16.716116, "CMa"],
    ["Antares", 247.351915, -26.432003, "Sco"],
    ["Alpheratz", 2.096916, 29.090431, "And"],
  ])("%s → %s", (_name, ra, dec, con) => {
    expect(constellationOf(ra, dec)).toBe(con);
  });
});

describe("geocentricPosition (light-time corrected, #123)", () => {
  const AU = 149_597_870.7;
  type V = { x: number; y: number; z: number };
  /** Angle (arcsec) between a vector and a J2000 RA/Dec (degrees). */
  const separation = (v: V, ra: number, dec: number) => {
    const [a, d] = [(ra * Math.PI) / 180, (dec * Math.PI) / 180];
    const r = Math.hypot(v.x, v.y, v.z);
    const dot =
      (v.x * Math.cos(d) * Math.cos(a) + v.y * Math.cos(d) * Math.sin(a) + v.z * Math.sin(d)) / r;
    return ((Math.acos(Math.min(1, dot)) * 180) / Math.PI) * 3600;
  };
  /** Geocentric → topocentric (km): minus the observer's offset from the geocentre. */
  const topocentric = (g: V, date: Date, height = 35): V => {
    const obs = new Astronomy.Observer(PARIS.latitude, PARIS.longitude, height);
    const o = Astronomy.ObserverVector(date, obs, false);
    return { x: g.x - o.x * AU, y: g.y - o.y * AU, z: g.z - o.z * AU };
  };

  // Date 1: JPL Horizons, the Paris references above (2026-10-01 0 h UT, quantity 1), compared
  // once the observer's offset from the geocentre is removed from our geocentric vector.
  it.each([
    ["Mars", 123.786393913, 20.853191985],
    ["Jupiter", 141.834286135, 15.624165707],
    ["Venus", 213.214738701, -20.850372721],
  ] as const)("%s within 1′ of Horizons on 2026-10-01", (body, ra, dec) => {
    const v = topocentric(geocentricPosition(body, DATE), DATE);
    expect(separation(v, ra, dec)).toBeLessThan(60);
  });

  it("Moon within 20″ of Horizons on 2026-10-01 (the 10″ target is not reached)", () => {
    // astronomy-engine's lunar theory and its ΔT (75.5 s, against ≈ 69 s observed) put the Moon
    // 14″ from Horizons at this date: the library does not meet the ticket's 10″ target.
    const v = topocentric(geocentricPosition("Moon", DATE), DATE);
    expect(separation(v, 60.974531838, 25.425071115)).toBeLessThan(20);
  });

  // Date 2: JPL Horizons, Neptune (899) geocentric on 1846-09-23 23:00 UT, as cited by the
  // content review #67 (packages/content/fr/constellations/Cap.md): α 330.38°, δ −12.67°,
  // rounded to 0.01° (±18″); the 1′ tolerance includes that rounding.
  it("Neptune within 1′ of Horizons on 1846-09-23", () => {
    const n = geocentricPosition("Neptune", new Date("1846-09-23T23:00:00Z"));
    expect(separation(n, 330.38, -12.67)).toBeLessThan(60);
  });

  // No further Horizons values could be fetched (JPL is unreachable from the build environment).
  // On three dates, every body is checked against astronomy-engine's own topocentric path
  // (Equator: J2000, no aberration, its own light-time iteration), tolerance 1″. This checks the
  // light-time correction and the frame, not the ephemeris itself.
  const BODIES = [
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
  ] as const;
  it.each(["2000-01-01T12:00:00Z", "2026-10-01T00:00:00Z", "2040-06-15T18:00:00Z"])(
    "agrees with astronomy-engine's Equator within 1″ on %s",
    (iso) => {
      const date = new Date(iso);
      const obs = new Astronomy.Observer(PARIS.latitude, PARIS.longitude, 0);
      for (const body of BODIES) {
        const v = topocentric(geocentricPosition(body, date), date, 0);
        const eq = Astronomy.Equator(Astronomy.Body[body], date, obs, false, false);
        // Equator does not backdate the Moon: its 0.7″ light-time shift stays within 1″.
        expect(separation(v, eq.ra * 15, eq.dec), body).toBeLessThan(1);
      }
    },
  );

  it("light time: ≈ 1.3 s for the Moon; Jupiter's distance as Horizons (quantity 20)", () => {
    const moon = geocentricPosition("Moon", DATE);
    expect(moon.lightTimeS).toBeCloseTo(moon.distanceKm / 299_792.458, 6);
    expect(moon.lightTimeS).toBeGreaterThan(1.1);
    expect(moon.lightTimeS).toBeLessThan(1.4);
    const jupiter = geocentricPosition("Jupiter", DATE);
    expect(Math.abs(jupiter.distanceKm / AU - 5.92083936263814) / 5.92083936263814).toBeLessThan(
      1e-3,
    );
  });
});
