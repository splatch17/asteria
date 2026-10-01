import { PLANETS, bodyPath, type Observer, type Planet } from "@asteria/astro-core";

const DAY = 86_400_000;

export interface PlanetPath {
  name: Planet;
  points: { date: Date; ra: number; dec: number }[];
}

/**
 * Apparent planet paths over ±`halfSpanDays` around a date, cheap enough for accelerated playback:
 * - samples sit on a fixed grid (every `stepDays` since the Unix epoch) and are cached, so a
 *   window that slides only computes its new samples;
 * - the window moves by buckets of `bucketDays`: `get` returns the same object until the date
 *   leaves its bucket, so callers can skip GPU uploads by comparing references.
 */
export class PlanetPathCache {
  private readonly samples = new Map<Planet, Map<number, { ra: number; dec: number }>>();
  private key = "";
  private paths: PlanetPath[] = [];
  /** Number of positions computed since creation (for tests and profiling). */
  computed = 0;

  constructor(
    private readonly stepDays = 2,
    private readonly halfSpanDays = 183,
    private readonly bucketDays = 10,
  ) {}

  get(date: Date, observer: Observer): PlanetPath[] {
    const place = `${observer.latitude},${observer.longitude}`;
    const bucket = Math.floor(date.getTime() / (this.bucketDays * DAY));
    const key = `${place}|${bucket}`;
    if (key === this.key) return this.paths;
    if (!this.key.startsWith(`${place}|`)) this.samples.clear(); // new place: topocentric change
    this.key = key;

    const centre = (bucket + 0.5) * this.bucketDays * DAY;
    const stepMs = this.stepDays * DAY;
    const first = Math.ceil((centre - this.halfSpanDays * DAY) / stepMs);
    const last = Math.floor((centre + this.halfSpanDays * DAY) / stepMs);
    this.paths = PLANETS.map((name) => {
      let cache = this.samples.get(name);
      if (!cache) this.samples.set(name, (cache = new Map()));
      for (const k of cache.keys()) if (k < first || k > last) cache.delete(k);
      const points: PlanetPath["points"] = [];
      for (let k = first; k <= last; k++) {
        let s = cache.get(k);
        if (!s) {
          const t = new Date(k * stepMs);
          const [p] = bodyPath(name, t, t, this.stepDays, observer);
          s = { ra: p!.ra, dec: p!.dec };
          cache.set(k, s);
          this.computed++;
        }
        points.push({ date: new Date(k * stepMs), ra: s.ra, dec: s.dec });
      }
      return { name, points };
    });
    return this.paths;
  }
}
