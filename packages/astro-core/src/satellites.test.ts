import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";
import reference from "./data/iss-reference.json";
import {
  ecefToHorizontal,
  elementsAgeDays,
  elementsFromOmm,
  elementsFromTle,
  findPasses,
  geodeticToEcef,
  horizontalToJ2000,
  isSunlit,
  orbitSummary,
  propagateMinutes,
  propagateTeme,
  satelliteLook,
  sunDirectionTeme,
  temeToEcef,
  temeToJ2000,
  type OmmRecord,
} from "./satellites";
import { applyMat3, j2000ToHorizontalMatrix, unitVector, type Vec3 } from "./matrices";

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Smallest difference between two angles, degrees. */
const angleDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

const [ISS_NAME, ISS_L1, ISS_L2] = reference.skyfield.tle as [string, string, string];
const iss = elementsFromTle(ISS_L1, ISS_L2, ISS_NAME);
const paris = reference.skyfield.observer;

// Vallado, Crawford, Hujsak & Kelso 2006, "Revisiting Spacetrack Report #3", AIAA 2006-6753
// (Rev 2): SGP4-VER.TLE and the C++ reference output tcppver.out (WGS-72, improved mode), via
// python-sgp4 2.27 (tools/iss-reference/build_iss_reference.py).
describe("SGP4 against Vallado's verification cases", () => {
  for (const c of reference.vallado) {
    it(`satellite ${c.satnum}: ${c.points.length} states within 1 mm and 1 µm/s`, () => {
      const el = elementsFromTle(c.line1, c.line2);
      let worstR = 0;
      let worstV = 0;
      for (const p of c.points) {
        const s = propagateMinutes(el, p.tsince);
        expect(s).not.toBeNull();
        worstR = Math.max(worstR, dist(s!.r, p.r as Vec3));
        worstV = Math.max(worstV, dist(s!.v, p.v as Vec3));
      }
      expect(worstR).toBeLessThan(1e-6);
      expect(worstV).toBeLessThan(1e-9);
    });
  }
});

describe("temeToEcef", () => {
  it("matches Vallado 2006 appendix C (TEME → ITRF) within 20 m without polar motion", () => {
    // 2004-04-06 07:51:28.386 UTC, ΔUT1 = −0.439961 s; xp = −0.140682″, yp = 0.333309″.
    const ut1 = new Date(Date.UTC(2004, 3, 6, 7, 51, 28, 386) - 439.961);
    const itrf = temeToEcef([5094.1801621, 6127.6446595, 6380.3445327], ut1);
    // Polar motion of 0.36″ moves a point 10 000 km away by ≈ 17 m: the tolerance.
    expect(dist(itrf, [-1033.479383, 7901.2952754, 6380.3565958])).toBeLessThan(0.02);
  });
});

// JPL Horizons, ISS (−125544) geocentric ICRF vectors, as quoted by Skyfield's
// test_earth_satellites.py (Horizons run of 2018-07-04 for this TLE).
describe("temeToJ2000", () => {
  const AU = 149_597_870.7;
  const tdbToUtc = (iso: string) => new Date(Date.parse(iso) - 69_184); // TT − UTC in 2018
  const cases: [string, Vec3][] = [
    ["2018-07-04T00:00:00Z", [2.6334042511582e-5, 1.015087620439817e-5, 3.544778677556393e-5]],
    ["2018-07-05T00:00:00Z", [-2.136440257814821e-5, -2.08417081451448e-5, -3.415494123796893e-5]],
  ];
  for (const [tdb, horizons] of cases)
    it(`ISS on ${tdb.slice(0, 10)} within 10 m of JPL Horizons`, () => {
      const date = tdbToUtc(tdb);
      const j = temeToJ2000(propagateTeme(iss, date)!.r, date);
      expect(dist(j, horizons.map((x) => x * AU) as Vec3)).toBeLessThan(0.01);
    });
});

describe("look angles", () => {
  it("geodeticToEcef puts the pole and the equator on the WGS-84 ellipsoid", () => {
    expect(dist(geodeticToEcef({ latitude: 0, longitude: 0 }), [6378.137, 0, 0])).toBeLessThan(
      1e-9,
    );
    const pole = geodeticToEcef({ latitude: 90, longitude: 0 });
    expect(Math.abs(pole[2] - 6356.752314245)).toBeLessThan(1e-6);
  });

  // Skyfield 1.55 (independent implementation, validated against JPL Horizons), same TLE, Paris,
  // 102 instants over three passes. Skyfield uses the measured UT1 (UT1 − UTC ≈ +0.07 s): ≈ 30 m
  // of Earth rotation, a few arcseconds at the ISS.
  it("altitude, azimuth and range within 0.005° (18″) and 50 m of Skyfield", () => {
    const site = geodeticToEcef(paris);
    let worstAngle = 0;
    let worstRange = 0;
    for (const s of reference.skyfield.samples) {
      const date = new Date(s.time);
      const r = ecefToHorizontal(temeToEcef(propagateTeme(iss, date)!.r, date), site, paris);
      worstAngle = Math.max(worstAngle, Math.abs(r.altitude - s.altitude));
      // Azimuth error matters as an angle on the sky: scaled by cos(altitude).
      worstAngle = Math.max(
        worstAngle,
        angleDiff(r.azimuth, s.azimuth) * Math.cos((s.altitude * Math.PI) / 180),
      );
      worstRange = Math.max(worstRange, Math.abs(r.rangeKm - s.rangeKm));
    }
    expect(worstAngle).toBeLessThan(0.005);
    expect(worstRange).toBeLessThan(0.05);
  });

  // astronomy-engine (validated against JPL Horizons in bodies.test.ts) for the Moon: the same
  // TEME → Earth-fixed → topocentric chain fed with the Moon's geocentric position of date
  // (true equator and equinox, turned to TEME's mean equinox). The Moon's parallax
  // (≈ 1°) checks the observer's position and the Earth's rotation.
  it("topocentric Moon within 5″ of astronomy-engine", () => {
    const observer = new Astronomy.Observer(paris.latitude, paris.longitude, 0);
    for (const iso of ["2018-07-04T03:00:00Z", "2026-10-23T21:00:00Z", "2030-01-01T00:00:00Z"]) {
      const date = new Date(iso);
      const time = Astronomy.MakeTime(date);
      const geo = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), Astronomy.GeoMoon(time));
      // True of date → TEME: right ascensions minus the equation of the equinoxes (up to 16″).
      const ee = (Astronomy.e_tilt(time).ee * 15 * Math.PI) / 180 / 3600;
      const km = Astronomy.KM_PER_AU;
      const [c, s] = [Math.cos(ee) * km, Math.sin(ee) * km];
      const look = ecefToHorizontal(
        temeToEcef([c * geo.x + s * geo.y, -s * geo.x + c * geo.y, geo.z * km], date),
        geodeticToEcef(paris),
        paris,
      );
      const topo = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, false);
      const hor = Astronomy.Horizon(date, observer, topo.ra, topo.dec);
      const dAlt = Math.abs(look.altitude - hor.altitude) * 3600;
      const dAz = angleDiff(look.azimuth, hor.azimuth) * Math.cos((hor.altitude * Math.PI) / 180);
      expect(dAlt).toBeLessThan(5);
      expect(dAz * 3600).toBeLessThan(5);
    }
  });

  it("horizontalToJ2000 is undone by the sky map's J2000 → horizontal matrix (< 1e-9°)", () => {
    const date = new Date("2018-07-06T02:47:00Z");
    for (const [azimuth, altitude] of [
      [12, 34],
      [250, -5],
      [180, 89.9],
    ] as const) {
      const { ra, dec } = horizontalToJ2000({ azimuth, altitude }, date, paris);
      const [n, e, u] = applyMat3(j2000ToHorizontalMatrix(date, paris), unitVector(ra, dec));
      expect(Math.abs((Math.asin(u) * 180) / Math.PI - altitude)).toBeLessThan(1e-9);
      expect(angleDiff((Math.atan2(e, n) * 180) / Math.PI, azimuth)).toBeLessThan(1e-7);
    }
  });
});

describe("Earth's shadow", () => {
  // Skyfield is_sunlit (DE421 Sun, sphere of 6 378.137 km) entries and exits over 2018-07-04.
  it("shadow entries and exits within 2 s of Skyfield", () => {
    for (const { time, sunlit } of reference.skyfield.shadow) {
      const t = Date.parse(time);
      for (const [dt, expected] of [
        [-2000, !sunlit],
        [2000, sunlit],
      ] as const) {
        const date = new Date(t + dt);
        expect(isSunlit(propagateTeme(iss, date)!.r, sunDirectionTeme(date))).toBe(expected);
      }
    }
  });

  it("sunlit state of every sample as Skyfield", () => {
    for (const s of reference.skyfield.samples) {
      const look = satelliteLook(iss, new Date(s.time), paris)!;
      expect(look.sunlit).toBe(s.sunlit);
    }
  });
});

describe("findPasses", () => {
  const events = reference.skyfield.events;
  const passes = findPasses(
    iss,
    paris,
    new Date("2018-07-03T00:00:00Z"),
    new Date("2018-07-07T00:00:00Z"),
  );

  it("finds every pass Skyfield finds over four days", () => {
    expect(passes.length).toBe(events.filter((e) => e.kind === "rise").length);
  });

  it("rise, culmination and set within 1 s, culmination altitude within 0.01° of Skyfield", () => {
    passes.forEach((p, i) => {
      const [rise, culmination, set] = events.slice(3 * i, 3 * i + 3);
      expect(Math.abs(p.rise.date.getTime() - Date.parse(rise!.time))).toBeLessThan(1000);
      expect(Math.abs(p.set.date.getTime() - Date.parse(set!.time))).toBeLessThan(1000);
      expect(Math.abs(p.culmination.date.getTime() - Date.parse(culmination!.time))).toBeLessThan(
        1000,
      );
      expect(Math.abs(p.culmination.altitude - culmination!.altitude)).toBeLessThan(0.01);
      expect(angleDiff(p.rise.azimuth, rise!.azimuth)).toBeLessThan(0.05);
      expect(angleDiff(p.set.azimuth, set!.azimuth)).toBeLessThan(0.05);
    });
  });

  it("flags as visible the dark-sky passes the ISS is sunlit in, and only those", () => {
    passes.forEach((p, i) => {
      const culmination = events[3 * i + 1]!;
      if (p.visible) {
        expect(p.visible.start.altitude).toBeGreaterThanOrEqual(10 - 0.05);
        expect(p.visible.max.altitude).toBeLessThanOrEqual(p.culmination.altitude + 1e-6);
        expect(p.visible.end.date.getTime()).toBeGreaterThan(p.visible.start.date.getTime());
      }
      // Skyfield's state at culmination decides the clear cases.
      if (culmination.sunlit && culmination.sunAltitude < -7 && culmination.altitude > 12)
        expect(p.visible).not.toBeNull();
      if (culmination.sunAltitude > -5) expect(p.visible).toBeNull();
    });
    // Over these four days: 2018-07-04 02:56 (14°), 2018-07-06 02:48 (27°) at least.
    const visibleDays = passes
      .filter((p) => p.visible)
      .map((p) => p.culmination.date.toISOString());
    expect(visibleDays.some((d) => d.startsWith("2018-07-04T02:5"))).toBe(true);
    expect(visibleDays.some((d) => d.startsWith("2018-07-06T02:4"))).toBe(true);
  });

  it("starts a pass under way at the start of the window there", () => {
    const [first] = findPasses(
      iss,
      paris,
      new Date("2018-07-06T02:48:00Z"),
      new Date("2018-07-06T03:00:00Z"),
    );
    expect(first!.rise.date.toISOString()).toBe("2018-07-06T02:48:00.000Z");
    expect(Math.abs(first!.set.date.getTime() - Date.parse("2018-07-06T02:53:07Z"))).toBeLessThan(
      2000,
    );
  });
});

describe("elements", () => {
  it("reads the epoch, inclination and mean motion of a TLE", () => {
    expect(iss.noradId).toBe(25544);
    expect(iss.name).toBe("ISS (ZARYA)");
    // 18184.80969102: day 184 of 2018 (3 July) + 0.80969102 d = 19:25:57.304 UTC.
    expect(Math.abs(iss.epoch.getTime() - Date.parse("2018-07-03T19:25:57.304Z"))).toBeLessThan(1);
    expect(iss.inclination).toBeCloseTo(51.6414, 6);
    expect(iss.meanMotion).toBeCloseTo(15.54005638, 8);
    expect(elementsAgeDays(iss, new Date("2018-07-05T19:25:57.304Z"))).toBeCloseTo(2, 6);
  });

  it("gives the same orbit from the OMM record (CelesTrak JSON) of the same elements", () => {
    const omm: OmmRecord = {
      OBJECT_NAME: "ISS (ZARYA)",
      OBJECT_ID: "1998-067A",
      EPOCH: "2018-07-03T19:25:57.304128",
      MEAN_MOTION: 15.54005638,
      ECCENTRICITY: 0.0003435,
      INCLINATION: 51.6414,
      RA_OF_ASC_NODE: 295.8524,
      ARG_OF_PERICENTER: 262.6267,
      MEAN_ANOMALY: 204.2868,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: "U",
      NORAD_CAT_ID: 25544,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 12110,
      BSTAR: 0.31745e-4,
      MEAN_MOTION_DOT: 0.00001614,
      MEAN_MOTION_DDOT: 0,
    };
    const fromOmm = elementsFromOmm(omm);
    const date = new Date("2018-07-05T00:00:00Z");
    // satellite.js reads the OMM epoch to the millisecond (0.128 ms dropped here: ≈ 1 m).
    expect(dist(propagateTeme(fromOmm, date)!.r, propagateTeme(iss, date)!.r)).toBeLessThan(2e-3);
  });

  it("rejects malformed elements", () => {
    expect(() => elementsFromTle("1 25544U", "2 25544")).toThrow();
  });

  it("orbit of the ISS: period from the mean motion, perigee and apogee near 400 km", () => {
    const o = orbitSummary(iss);
    expect(o.periodMin).toBeCloseTo(1440 / 15.54005638, 9);
    expect(o.perigeeKm).toBeGreaterThan(395);
    expect(o.apogeeKm).toBeLessThan(420);
    expect(o.apogeeKm - o.perigeeKm).toBeCloseTo(2 * 0.0003435 * (o.perigeeKm + 6378.135), 0);
  });
});
