import { describe, expect, it } from "vitest";
import { bodyPosition } from "./bodies";
import { ASTRONOMICAL_NIGHT_SUN, nextDarkNight } from "./twilight";

// Reference: Skyfield 1.55 with JPL DE421 (Sun's apparent geometric altitude, no refraction):
// first instant the Sun goes below −18° (almanac.find_discrete), and the Sun's lowest point
// (almanac.meridian_transits, antitransit) where it never does. Run from the build environment
// (JPL Horizons itself is not reachable from it): tools/twilight-reference/twilight_reference.py.
const MINUTE = 60_000;
const utc = (...a: [number, number, number, number, number, number]) =>
  new Date(Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4], a[5]));

describe("nextDarkNight vs Skyfield / DE421 (#198)", () => {
  it.each([
    ["Paris, autumn", 48.8566, 2.3522, utc(2026, 10, 24, 12, 30, 0), utc(2026, 10, 24, 18, 29, 47)],
    [
      "Toulouse, winter solstice",
      43.6,
      1.44,
      utc(2026, 12, 21, 12, 0, 0),
      utc(2026, 12, 21, 18, 4, 24),
    ],
    ["Sydney, spring", -33.87, 151.21, utc(2026, 10, 24, 2, 0, 0), utc(2026, 10, 24, 9, 44, 53)],
  ] as const)("%s: Sun at −18° within 1 min", (_, latitude, longitude, from, expected) => {
    const night = nextDarkNight(from, { latitude, longitude });
    expect(night?.astronomical).toBe(true);
    expect(Math.abs(night!.date.getTime() - expected.getTime())).toBeLessThan(MINUTE);
    // Consistent with the app's Sun (validated against JPL Horizons), to 0.05°.
    const sun = bodyPosition("Sun", night!.date, { latitude, longitude });
    expect(sun.altitude).toBeCloseTo(ASTRONOMICAL_NIGHT_SUN, 1);
  });

  it("Paris at the June solstice never gets to −18°: the darkest moment instead (−17.7°)", () => {
    const night = nextDarkNight(utc(2026, 6, 21, 12, 0, 0), {
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(night?.astronomical).toBe(false);
    const expected = utc(2026, 6, 21, 23, 52, 31);
    expect(Math.abs(night!.date.getTime() - expected.getTime())).toBeLessThan(MINUTE);
  });

  it("no dark night under the midnight sun (Tromsø, June: Sun at +3.1° at its lowest)", () => {
    expect(nextDarkNight(utc(2026, 6, 21, 12, 0, 0), { latitude: 69.65, longitude: 18.96 })).toBe(
      null,
    );
  });

  it("finds the next one when the night has already begun", () => {
    const night = nextDarkNight(utc(2026, 10, 24, 21, 0, 0), {
      latitude: 48.8566,
      longitude: 2.3522,
    });
    // The following evening (Skyfield: 18:28:07 UT on the 25th).
    expect(Math.abs(night!.date.getTime() - utc(2026, 10, 25, 18, 28, 7).getTime())).toBeLessThan(
      MINUTE,
    );
  });
});
