/**
 * The coming night (#198): when the sky gets fully dark after a given instant, for the map's
 * « Voir ce soir » by day. Sun from astronomy-engine (MIT, validated against JPL Horizons in
 * bodies.test.ts), geometric altitude of its centre (no refraction), as in the usual definition
 * of twilight.
 */
import * as Astronomy from "astronomy-engine";
import type { Observer } from "./coords";

/** End of astronomical twilight: the Sun 18° below the horizon, the sky as dark as it gets. */
export const ASTRONOMICAL_NIGHT_SUN = -18;
/** Below this (end of nautical twilight) the stars of the figures are all out. */
export const NAUTICAL_NIGHT_SUN = -12;

export interface NightStart {
  date: Date;
  /**
   * True when the Sun reaches ASTRONOMICAL_NIGHT_SUN; false in the light summer nights of high
   * latitudes (Paris around the June solstice), where `date` is the darkest moment instead: the
   * Sun's lowest point, if it is at least NAUTICAL_NIGHT_SUN below the horizon.
   */
  astronomical: boolean;
}

/**
 * The next start of a dark night after `date`, within a day: the instant the setting Sun goes
 * below 18°; failing that, the Sun's lowest point when the night still gets nautically dark.
 * null when it does not (midnight sun, white nights of the far north).
 */
export function nextDarkNight(date: Date, observer: Observer): NightStart | null {
  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, 0);
  const dark = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    obs,
    -1,
    date,
    1,
    ASTRONOMICAL_NIGHT_SUN,
  );
  if (dark) return { date: dark.date, astronomical: true };
  const lowest = Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 12, date);
  if (lowest.time.ut - Astronomy.MakeTime(date).ut > 1) return null;
  // `lowest.hor` is refracted; the geometric altitude is compared, as for the search above.
  const sun = Astronomy.Equator(Astronomy.Body.Sun, lowest.time, obs, true, true);
  const altitude = Astronomy.Horizon(lowest.time, obs, sun.ra, sun.dec).altitude;
  return altitude <= NAUTICAL_NIGHT_SUN ? { date: lowest.time.date, astronomical: false } : null;
}
