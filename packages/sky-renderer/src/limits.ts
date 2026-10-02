/** Limiting magnitudes of the sky map (stars by field of view, planets by daylight). */

/** Faintest magnitude displayed for a given field of view. */
export function limitingMagnitude(fov: number): number {
  return Math.min(6.5, Math.max(4.6, 5.0 + 2.2 * Math.log10(90 / fov)));
}

/** At night, planets are hidden this many magnitudes later than stars (they are never lost). */
export const PLANET_DAYLIGHT_MARGIN = 4;

/** Daylight cap on planet magnitudes: (Sun altitude in degrees, faintest magnitude) nodes. */
const PLANET_DAY_CAP: readonly (readonly [number, number])[] = [
  [-18, 10],
  [-6, 1.0],
  [0, -2.0],
  [10, -3.4],
];

/**
 * Faintest planet magnitude shown, from the stars' limiting magnitude and the Sun's altitude.
 *
 * Night: the stars' limit + PLANET_DAYLIGHT_MARGIN. As the Sun rises, a daylight cap takes over,
 * linear between these (Sun altitude → magnitude) nodes:
 *   −18° → 10 (no cap: fainter than Neptune)
 *   −6° → 1.0 (end of civil twilight: Mercury, Saturn, Mars, Jupiter)
 *   0° → −2.0 (sunrise: Jupiter still, Mercury gone) · ≥ +10° → −3.4 (full day: Venus only)
 * −3.4 sits between Jupiter's brightest (−2.9) and Venus's faintest (−3.8), so with the Sun high
 * only Venus remains, and Jupiter only shows in twilight.
 */
export function planetLimitingMagnitude(starLimit: number, sunAltitude: number): number {
  const nodes = PLANET_DAY_CAP;
  let cap = sunAltitude <= nodes[0]![0] ? nodes[0]![1] : nodes.at(-1)![1];
  for (let i = 1; i < nodes.length; i++) {
    const [a0, m0] = nodes[i - 1]!;
    const [a1, m1] = nodes[i]!;
    if (sunAltitude > a0 && sunAltitude <= a1) {
      cap = m0 + ((m1 - m0) * (sunAltitude - a0)) / (a1 - a0);
      break;
    }
  }
  return Math.min(starLimit + PLANET_DAYLIGHT_MARGIN, cap);
}
