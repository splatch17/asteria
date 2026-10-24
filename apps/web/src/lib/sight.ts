/**
 * « Can I see it? » for the sheets (#201): whether an object is up and the sky dark enough to see
 * it, and where to look, or when it rises. Positions come from astro-core (the stars' horizontal
 * transform through `altitudeOf`, `bodyPosition` for the Sun, Moon and planets); the rising is
 * `nextRiseOf` (lib/horizon, checked against Skyfield / DE421).
 *
 * Conventions:
 * - Horizon: the object's centre at 0° of geometric altitude (no refraction), the same test as
 *   the sheets' « Sous l'horizon », so a sheet turns from « se lève à … » to « visible » at the
 *   minute it announced.
 * - Darkness: an object above the horizon is said visible once the Sun is low enough for its
 *   brightness, by the usual twilight steps: the Sun and the Moon at any time; the brightest
 *   stars and planets (magnitude ≤ 1) from the end of civil twilight (Sun at −6°); stars and
 *   planets down to magnitude 3.5 from the end of nautical twilight (−12°); fainter ones and
 *   every deep-sky object only once the sky is fully dark (end of astronomical twilight, −18°).
 */

export type SightKind = "star" | "planet" | "deepsky" | "moon" | "sun";

/** Sun altitude (degrees) below which an object of this kind and magnitude can be seen. */
export function darkBelow(kind: SightKind, magnitude = 0): number {
  if (kind === "moon" || kind === "sun") return 90;
  if (kind === "deepsky") return -18;
  if (magnitude <= 1) return -6;
  if (magnitude <= 3.5) return -12;
  return -18;
}

/** What a sheet says about seeing the object. */
export type Sight =
  | { state: "visible"; altitude: number; azimuth: number }
  /** Up, but the sky is still too bright for it. */
  | { state: "daylight"; altitude: number; azimuth: number }
  | { state: "rises"; at: number }
  /** Down, and it does not rise within the next day (a star: never, from this place). */
  | { state: "down" };

/**
 * The sight of an object now, from its geometric altitude and azimuth, the Sun's altitude, the
 * darkness it needs (`darkBelow`) and, called only when it is down, its next rising (Unix ms).
 */
export function sightOf(o: {
  altitude: number;
  azimuth: number;
  sunAltitude: number;
  darkBelow: number;
  rise: () => number | null;
}): Sight {
  if (o.altitude >= 0)
    return {
      state: o.sunAltitude < o.darkBelow ? "visible" : "daylight",
      altitude: o.altitude,
      azimuth: o.azimuth,
    };
  const at = o.rise();
  return at === null ? { state: "down" } : { state: "rises", at };
}

/**
 * Memo of the rising search for the object shown: time playback moves the date every frame, and
 * the next rising stays the same while the object stays down and the date moves on towards it
 * (it drifts by seconds a day for a star, by minutes for the Moon, caught up at the next search,
 * at the latest an hour later).
 */
export class RiseMemo {
  #key = "";
  #from = Number.NaN;
  #at: number | null = null;

  /** Next rising of object `key` (any string naming the object and the place) after `now`. */
  get(key: string, now: number, search: (from: number) => number | null): number | null {
    const fresh =
      key === this.#key &&
      now >= this.#from &&
      now - this.#from < 3_600_000 &&
      (this.#at === null || now < this.#at);
    if (!fresh) {
      this.#key = key;
      this.#from = now;
      this.#at = search(now);
    }
    return this.#at;
  }
}
