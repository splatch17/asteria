/**
 * Stars in daylight (#106). The sky map is for learning the sky at any hour: by default the stars,
 * figures and names stay drawn over the day sky, as at night, and the app says they are not
 * visible to the naked eye. The `realisticDaylight` layer restores the physical rendering (#34):
 * daylight lowers the limiting magnitude above the horizon by up to DAYLIGHT_EXTINCTION.
 *
 * Planets, the Sun and the Moon always follow the physical rule (planetLimitingMagnitude is fed
 * the physical star limit), and below the horizon it is always night (see see-through.ts).
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
 * Limiting magnitude of the stars drawn above the horizon (the shader's uLimitMag; picking and
 * star names follow it): the night limit, unless the realistic daylight layer is on.
 */
export function daylightStarLimit(fovLimit: number, daylight: number, realistic: boolean): number {
  return realistic ? physicalStarLimit(fovLimit, daylight) : fovLimit;
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
 * raised as the sky brightens so that parchment keeps its contrast on the day blue. `daylight`
 * is 0 with the realistic layer (unchanged rendering).
 */
export function dayInkAlpha(base: number, daylight: number): number {
  return base + (1 - base) * DAY_INK_GAIN * Math.min(1, Math.max(0, daylight));
}
