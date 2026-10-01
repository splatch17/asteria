import { PLANETS, bodyPath, type Observer, type Planet } from "@asteria/astro-core";

const DAY = 86_400_000;

export interface PlanetPathPoint {
  date: Date;
  ra: number;
  dec: number;
  /** True on the first day of a month (local midnight): drawn as a dated mark. */
  mark?: boolean;
}

export interface PlanetPath {
  name: Planet;
  points: PlanetPathPoint[];
}

/**
 * Starts of the months (1st of the month, 00:00 local time) inside [startMs, endMs], as epoch
 * milliseconds. Local time, because the marks are labelled with the local date.
 */
export function monthStarts(startMs: number, endMs: number): number[] {
  const out: number[] = [];
  const d = new Date(startMs);
  let year = d.getFullYear();
  let month = d.getMonth();
  for (;;) {
    const t = new Date(year, month, 1).getTime();
    if (t > endMs) break;
    if (t >= startMs) out.push(t);
    if (++month === 12) [year, month] = [year + 1, 0];
  }
  return out;
}

type Sample = { ra: number; dec: number };

/**
 * Apparent planet paths over ±`halfSpanDays` around a date, cheap enough for accelerated playback:
 * - samples sit on a fixed grid (every `stepDays` since the Unix epoch), plus one sample at the
 *   exact start of each month (the dated marks); both are cached, so a window that slides only
 *   computes its new samples;
 * - the window moves by buckets of `bucketDays`: `get` / `path` return the same objects until the
 *   date leaves its bucket, so callers can skip GPU uploads by comparing references;
 * - paths are built per planet on demand: selecting one planet only computes that planet.
 */
export class PlanetPathCache {
  private readonly grid = new Map<Planet, Map<number, Sample>>();
  private readonly months = new Map<Planet, Map<number, Sample>>();
  private place = "";
  private bucket = NaN;
  private readonly built = new Map<Planet, PlanetPath>();
  private all: PlanetPath[] | null = null;
  /** Number of positions computed since creation (for tests and profiling). */
  computed = 0;

  constructor(
    private readonly stepDays = 2,
    private readonly halfSpanDays = 183,
    private readonly bucketDays = 10,
  ) {}

  /** Paths of every planet, in PLANETS order. */
  get(date: Date, observer: Observer): PlanetPath[] {
    this.sync(date, observer);
    this.all ??= PLANETS.map((name) => this.build(name, observer));
    return this.all;
  }

  /** Path of one planet. */
  path(name: Planet, date: Date, observer: Observer): PlanetPath {
    this.sync(date, observer);
    return this.build(name, observer);
  }

  private sync(date: Date, observer: Observer): void {
    const place = `${observer.latitude},${observer.longitude}`;
    const bucket = Math.floor(date.getTime() / (this.bucketDays * DAY));
    if (place === this.place && bucket === this.bucket) return;
    if (place !== this.place) {
      // New place: topocentric positions change.
      this.grid.clear();
      this.months.clear();
    }
    this.place = place;
    this.bucket = bucket;
    this.built.clear();
    this.all = null;
  }

  private build(name: Planet, observer: Observer): PlanetPath {
    const done = this.built.get(name);
    if (done) return done;
    const centre = (this.bucket + 0.5) * this.bucketDays * DAY;
    const [start, end] = [centre - this.halfSpanDays * DAY, centre + this.halfSpanDays * DAY];
    const stepMs = this.stepDays * DAY;
    const first = Math.ceil(start / stepMs);
    const last = Math.floor(end / stepMs);

    const grid = this.cacheFor(this.grid, name);
    const months = this.cacheFor(this.months, name);
    for (const k of grid.keys()) if (k < first || k > last) grid.delete(k);
    for (const t of months.keys()) if (t < start || t > end) months.delete(t);

    const marks = monthStarts(start, end);
    const points: PlanetPathPoint[] = [];
    let m = 0;
    for (let k = first; k <= last; k++) {
      const t = k * stepMs;
      while (m < marks.length && marks[m]! <= t) {
        const mt = marks[m++]!;
        points.push({
          date: new Date(mt),
          ...this.sample(months, mt, mt, name, observer),
          mark: true,
        });
      }
      if (points.at(-1)?.date.getTime() === t) continue; // a month start on the grid
      points.push({ date: new Date(t), ...this.sample(grid, k, t, name, observer) });
    }
    while (m < marks.length) {
      const mt = marks[m++]!;
      points.push({
        date: new Date(mt),
        ...this.sample(months, mt, mt, name, observer),
        mark: true,
      });
    }
    const path = { name, points };
    this.built.set(name, path);
    return path;
  }

  private cacheFor(caches: Map<Planet, Map<number, Sample>>, name: Planet) {
    let cache = caches.get(name);
    if (!cache) caches.set(name, (cache = new Map()));
    return cache;
  }

  private sample(
    cache: Map<number, Sample>,
    key: number,
    t: number,
    name: Planet,
    observer: Observer,
  ): Sample {
    let s = cache.get(key);
    if (!s) {
      const date = new Date(t);
      const [p] = bodyPath(name, date, date, 1, observer);
      s = { ra: p!.ra, dec: p!.dec };
      cache.set(key, s);
      this.computed++;
    }
    return s;
  }
}
