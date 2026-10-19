/**
 * Stars in daylight (#106). The sky map is for learning the sky at any hour: by default the stars,
 * figures and names stay drawn over the day sky, as at night, and the app says they are not
 * visible to the naked eye (#162: the optional "realistic" daytime sky that hid them was removed).
 *
 * Planets, the Sun and the Moon follow the physical rule: planetLimitingMagnitude is fed the
 * physical star limit, which daylight lowers by up to DAYLIGHT_EXTINCTION above the horizon;
 * below the horizon it is always night (see see-through.ts).
 */

/** Magnitudes daylight takes from the stars' limit at full day: only mag ≲ −1 would remain. */
export const DAYLIGHT_EXTINCTION = 7;

/**
 * 0 = dark night … 1 = full daylight, from the Sun's altitude (degrees): stars fade out between
 * astronomical twilight (−18°) and sunrise, quadratically (slowly at first).
 */
export function daylightFactor(sunAltitude: number): number {
  const k = Math.min(1, Math.max(0, (sunAltitude + 18) / 18));
  return k * k;
}

/** Physical limiting magnitude above the horizon: the field's limit, drowned by daylight. */
export function physicalStarLimit(fovLimit: number, daylight: number): number {
  return fovLimit - daylight * DAYLIGHT_EXTINCTION;
}

/**
 * Daylight at which the app says the stars drawn are not visible to the naked eye: when daylight
 * has taken at least one magnitude from them (Sun above ≈ −11°, nautical twilight).
 */
export function starsHiddenByDaylight(sunAltitude: number): boolean {
  return daylightFactor(sunAltitude) * DAYLIGHT_EXTINCTION >= 1;
}

/** Share of the remaining opacity added to labels and lines at full day (see dayInkAlpha). */
export const DAY_INK_GAIN = 0.6;

/**
 * Opacity of the ink (names, constellation lines) over the day sky: the night opacity `base`,
 * raised as the sky brightens so that parchment keeps its contrast on the day blue.
 */
export function dayInkAlpha(base: number, daylight: number): number {
  return base + (1 - base) * DAY_INK_GAIN * Math.min(1, Math.max(0, daylight));
}
