/**
 * Validity range of the Moon and planet positions (#73).
 *
 * The app computes them with astronomy-engine (truncated VSOP87 for the planets, a truncated
 * lunar theory for the Moon). Our accuracy tests compare it with JPL Horizons near the present
 * only (packages/astro-core), its documented accuracy covers recent centuries, and over
 * millennia the truncation and ΔT errors grow (the Moon's position first). The time slider reaches ±13 000 years (26 000-year scale): beyond ±3 000 years from
 * J2000 both views hide the Moon, the planets and their paths rather than show doubtful
 * positions. The Sun stays: daylight and the seasons depend on it, and the Earth's orbit is the
 * best-behaved of the series.
 */

/** Half-width of the range, in Julian years from J2000. */
export const EPHEMERIS_RANGE_YEARS = 3000;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_JULIAN_YEAR = 365.25 * 86_400_000;

/** True when the Moon and planet positions can be shown for this date. */
export function ephemerisReliable(date: Date): boolean {
  const years = (date.getTime() - J2000_MS) / MS_PER_JULIAN_YEAR;
  return Math.abs(years) <= EPHEMERIS_RANGE_YEARS;
}
