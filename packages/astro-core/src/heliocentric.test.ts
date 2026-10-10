import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";
import {
  ORBITAL_PERIOD_DAYS,
  ORBITING_BODIES,
  geocentricPosition,
  heliocentricPosition,
  meanObliquity,
  seasons,
  type OrbitingBody,
} from "./index";

/** Angle (arcsec) between two vectors. */
function separation(a: number[], b: number[]): number {
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const n = Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!);
  return ((Math.acos(Math.min(1, dot / n)) * 180) / Math.PI) * 3600;
}

/** UTC instant of a Julian Date on the TDB scale (TDB − TT < 2 ms, neglected). */
const fromTdb = (jd: number): Date => Astronomy.AstroTime.FromTerrestrialTime(jd - 2451545).date;

// Reference: JPL Horizons (DE441), heliocentric GEOMETRIC cartesian states, centre "Sun (10)
// body centre", ICRF, au — the tables generate/heliostate/<Body>.txt of the astronomy-engine
// repository (github.com/cosinekitty/astronomy, commit 865d3da7d811, Horizons run of
// 2021-11-14). JPL Horizons itself is not reachable from the build environment; these are
// Horizons' own outputs, archived. One state per body in 2001, 2026 and 2039 (first table entry
// of each year). Tolerance: 1′ in direction seen from the Sun (issue #124; measured: 15″ at most, Neptune),
// 1e-4 in distance.
const HORIZONS: Record<OrbitingBody, [number, number, number, number][]> = {
  Mercury: [
    [2451915.5, 2.618262751813199e-1, -2.843948575514849e-1, -1.790671918739822e-1],
    [2461043.5, -1.755354809673777e-1, -3.871258944911505e-1, -1.886110765013478e-1],
    [2465795.5, -1.409713516922196e-1, -3.978956590586947e-1, -1.979611609271056e-1],
  ],
  Venus: [
    [2451915.5, 4.156431615913476e-1, 5.479952593498711e-1, 2.20231125384857e-1],
    [2461043.5, 1.285973182999396e-1, -6.499202464783544e-1, -3.005815242204812e-1],
    [2465795.5, 6.464792254078907e-1, -2.877667917289526e-1, -1.703919934606658e-1],
  ],
  Earth: [
    [2451915.5, -2.664893993958707e-1, 8.683906802015998e-1, 3.764933540517989e-1],
    [2461043.5, -2.08574091023267e-1, 8.816577855058015e-1, 3.821815540778031e-1],
    [2465795.5, -2.707290068234102e-1, 8.673426928098641e-1, 3.759528958220443e-1],
  ],
  Mars: [
    [2451915.5, -1.640915126845803, -1.264252274450864e-1, -1.362499747592371e-2],
    [2461047.5, 4.246197069799137e-1, -1.229782555541723, -5.755247174222785e-1],
    [2465799.5, -3.910654982914113e-1, -1.310466658534737, -5.905582615302344e-1],
  ],
  Jupiter: [
    [2451920.5, 1.725014161732485, 4.376516070406225, 1.833888814746781],
    [2461070.5, -1.902144080527043, 4.453400632791895, 1.95515002552809],
    [2465820.5, -4.377410265427752, 2.797998743655997, 1.305841738023471],
  ],
  Saturn: [
    [2451920.5, 4.634810364341865, 7.319188468016407, 2.823708122251155],
    [2461070.5, 9.492541747498171, 5.376933358779834e-1, -1.866794126016877e-1],
    [2465820.5, -9.380598701360501, 7.802799681834103e-1, 7.263013679908948e-1],
  ],
  Uranus: [
    [2451920.5, 15.39802841197352, -11.55021185168907, -5.276616458090289],
    [2461070.5, 9.780787475128102, 15.4871694068153, 6.644497227901834],
    [2465820.5, -8.285328109923373, 15.25393927185614, 6.797930822814712],
  ],
  Neptune: [
    [2451920.5, 17.76690371248224, -22.33676095392423, -9.584836500982181],
    [2461070.5, 29.86960985074631, 8.389133769684509e-1, -4.002205876643199e-1],
    [2465820.5, 25.80406236801014, 14.03921257241106, 5.104004150185951],
  ],
};

describe("heliocentricPosition vs JPL Horizons DE441 (#124)", () => {
  for (const body of ORBITING_BODIES) {
    it.each(HORIZONS[body])(`${body} at JD %s TDB within 1′ and 1e-4 au`, (jd, x, y, z) => {
      const p = heliocentricPosition(body, fromTdb(jd));
      const sep = separation([p.x, p.y, p.z], [x, y, z]);
      expect(sep).toBeLessThan(60);
      expect(Math.abs(p.distanceAu - Math.hypot(x, y, z)) / Math.hypot(x, y, z)).toBeLessThan(1e-4);
    });
  }

  it("is consistent with the geocentric positions (planet − Earth, light time aside)", () => {
    // Geocentric astrometric = heliocentric of the planet at t − τ minus the Earth's at t.
    const date = new Date("2026-10-01T00:00:00Z");
    const earth = heliocentricPosition("Earth", date);
    for (const body of ["Mars", "Jupiter", "Venus"] as const) {
      const g = geocentricPosition(body, date);
      const p = heliocentricPosition(body, new Date(date.getTime() - g.lightTimeS * 1000));
      const AU = 149_597_870.7;
      const v = [p.x - earth.x, p.y - earth.y, p.z - earth.z];
      expect(separation(v, [g.x / AU, g.y / AU, g.z / AU])).toBeLessThan(1);
    }
  });

  it("orbital periods are those of Horizons' physical data (Earth 365.25636 d)", () => {
    expect(ORBITAL_PERIOD_DAYS.Earth).toBe(365.25636);
    // One period later the Earth is back in the same direction within 0.05°.
    const t0 = new Date("2026-01-01T00:00:00Z");
    const a = heliocentricPosition("Earth", t0);
    const b = heliocentricPosition("Earth", new Date(t0.getTime() + 365.25636 * 86_400_000));
    expect(separation([a.x, a.y, a.z], [b.x, b.y, b.z])).toBeLessThan(180);
  });
});

// Reference: U.S. Naval Observatory, Astronomical Applications Department, "Earth's Seasons"
// (api.usno.navy.mil/seasons), times UT rounded to the minute, as archived in the
// astronomy-engine repository (generate/seasons/seasons.txt, commit 865d3da7d811). USNO and
// IMCCE are not reachable from the build environment. Tolerance: 10 min (issue #128).
const USNO: [number, string, string, string, string][] = [
  [2000, "2000-03-20T07:35Z", "2000-06-21T01:48Z", "2000-09-22T17:28Z", "2000-12-21T13:37Z"],
  [2024, "2024-03-20T03:06Z", "2024-06-20T20:51Z", "2024-09-22T12:44Z", "2024-12-21T09:20Z"],
  [2025, "2025-03-20T09:01Z", "2025-06-21T02:42Z", "2025-09-22T18:19Z", "2025-12-21T15:03Z"],
  [2026, "2026-03-20T14:46Z", "2026-06-21T08:24Z", "2026-09-23T00:05Z", "2026-12-21T20:50Z"],
  [2027, "2027-03-20T20:25Z", "2027-06-21T14:11Z", "2027-09-23T06:02Z", "2027-12-22T02:42Z"],
  [2100, "2100-03-20T13:05Z", "2100-06-21T05:33Z", "2100-09-22T22:02Z", "2100-12-21T19:52Z"],
];

describe("seasons vs USNO (#128)", () => {
  it.each(USNO)("%s within 10 min", (year, mar, jun, sep, dec) => {
    const s = seasons(year);
    const minutes = (d: Date, iso: string) => Math.abs(d.getTime() - Date.parse(iso)) / 60_000;
    expect(minutes(s.marchEquinox, mar)).toBeLessThan(10);
    expect(minutes(s.juneSolstice, jun)).toBeLessThan(10);
    expect(minutes(s.septemberEquinox, sep)).toBeLessThan(10);
    expect(minutes(s.decemberSolstice, dec)).toBeLessThan(10);
  });

  it("puts the Sun at ± the obliquity (IAU 2006) at the solstices, at 0° at the equinoxes", () => {
    // Apparent declination of date: the true obliquity differs from the mean one by the
    // nutation in obliquity (≤ 9.2″), hence 0.005°.
    const s = seasons(2026);
    const dec = (d: Date) =>
      Astronomy.Equator(Astronomy.Body.Sun, d, new Astronomy.Observer(0, 0, 0), true, true).dec;
    expect(Math.abs(dec(s.juneSolstice) - meanObliquity(s.juneSolstice))).toBeLessThan(0.005);
    expect(Math.abs(dec(s.decemberSolstice) + meanObliquity(s.decemberSolstice))).toBeLessThan(
      0.005,
    );
    // The Sun moves 0.4° a day in declination near the equinoxes: 0.005° ≈ 18 min.
    expect(Math.abs(dec(s.marchEquinox))).toBeLessThan(0.005);
    expect(Math.abs(dec(s.septemberEquinox))).toBeLessThan(0.005);
  });
});
