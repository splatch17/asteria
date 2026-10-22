import { describe, expect, it } from "vitest";
import {
  constellationAt,
  parseConstellationBounds,
  unitVector,
  type ConstellationBoundsFile,
  type Vec3,
} from "@asteria/astro-core";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { CONSTELLATION_LATIN } from "@asteria/content";
import boundsFile from "../../../../../packages/astro-core/src/data/constellation-bounds.json";
import { GAMES } from "./catalog";
import { angleBetween, type ConstellationShape } from "./geometry";
import { DISCOVERY_CONSTELLATIONS } from "./pool";
import { emptyProgress, parseProgress, recordAnswer } from "./progress";
import { mulberry32 } from "./rng";
import {
  MAX_POINTS,
  MIN_POINTS,
  SERIES_LENGTH,
  TIMING,
  buildWhereSeries,
  gradeFor,
  judge,
  pointsFor,
  silhouette,
  slerp,
  slopDegrees,
} from "./where-is-it";

const T0 = Date.UTC(2026, 9, 21, 20);
const SHAPES: Record<string, ConstellationShape> = Object.fromEntries(
  Object.keys(CONSTELLATION_LATIN).map((abbr, i) => [
    abbr,
    { abbr, centre: unitVector((i * 137.508) % 360, 0), radius: 8 },
  ]),
);

describe("« Où est-elle ? » score", () => {
  it("gives full points within the grace time, then less, never below the floor", () => {
    for (const level of ["discovery", "amateur", "expert"] as const) {
      const { grace, window } = TIMING[level];
      expect(pointsFor(0, level)).toBe(MAX_POINTS);
      expect(pointsFor(grace, level)).toBe(MAX_POINTS);
      expect(pointsFor(grace + window / 2, level)).toBe((MAX_POINTS + MIN_POINTS) / 2);
      expect(pointsFor(grace + window, level)).toBe(MIN_POINTS);
      expect(pointsFor(10 * 60_000, level)).toBe(MIN_POINTS);
      expect(pointsFor(grace + 1000, level)).toBeLessThan(pointsFor(grace + 500, level));
    }
    // Beginners get more time.
    expect(pointsFor(8000, "discovery")).toBeGreaterThan(pointsFor(8000, "expert"));
  });

  it("grades the memory: good when quick, hard when slow or on the edge, again when wrong", () => {
    expect(gradeFor(true, 1000, "amateur")).toBe("good");
    expect(gradeFor(true, 60_000, "amateur")).toBe("hard");
    expect(gradeFor(true, 1000, "amateur", true)).toBe("hard");
    expect(gradeFor(false, 1000, "amateur")).toBe("again");
  });

  it("accepts a tap inside, or just at the edge", () => {
    expect(judge("Ori", { tapped: "Ori", distance: 3 }, 0.5)).toEqual({ correct: true, edge: false });
    expect(judge("Ori", { tapped: "Tau", distance: 0.3 }, 0.5)).toEqual({ correct: true, edge: true });
    expect(judge("Ori", { tapped: "Tau", distance: 2 }, 0.5)).toEqual({ correct: false, edge: false });
  });

  it("converts the finger's slop to degrees at the field of view", () => {
    // 12 px over 600 px of a 100° field: about 2°; narrower field, smaller angle.
    expect(slopDegrees(100, 600)).toBeGreaterThan(1.5);
    expect(slopDegrees(100, 600)).toBeLessThan(2.5);
    expect(slopDegrees(30, 600)).toBeLessThan(slopDegrees(100, 600) / 2);
  });
});

describe("« Où est-elle ? » series", () => {
  it("draws 10 different constellations of the level's pool", () => {
    const series = buildWhereSeries({
      level: "discovery",
      shapes: SHAPES,
      progress: emptyProgress(),
      now: T0,
      rng: mulberry32(7),
    });
    expect(series).toHaveLength(SERIES_LENGTH);
    expect(new Set(series).size).toBe(SERIES_LENGTH);
    for (const a of series) expect(DISCOVERY_CONSTELLATIONS).toContain(a);
  });

  it("brings back what was missed (shared memory con:XXX)", () => {
    let progress = emptyProgress();
    for (const a of Object.keys(SHAPES))
      progress = recordAnswer(progress, `con:${a}`, true, T0 - 7_200_000);
    progress = recordAnswer(progress, "con:Lyr", false, T0 - 3_600_000);
    const hits = Array.from({ length: 20 }, (_, i) =>
      buildWhereSeries({
        level: "amateur",
        shapes: SHAPES,
        progress,
        now: T0,
        rng: mulberry32(100 + i),
      }).includes("Lyr"),
    ).filter(Boolean).length;
    expect(hits).toBeGreaterThan(15);
  });

  it("replaces « Relie les étoiles », whose saved stats stay readable", () => {
    expect(GAMES.map((g) => g.id)).toEqual(["whichConstellation", "whereIsIt", "nameStar"]);
    const p = parseProgress({
      version: 2,
      items: {},
      games: { connectStars: { played: 3, best: 4 }, whichConstellation: { played: 1, best: 7 } },
      seen: {},
    });
    expect(p.games.whichConstellation).toEqual({ played: 1, best: 7 });
    expect(p.games.connectStars).toEqual({ played: 3, best: 4 });
  });
});

describe("camera path and silhouette card", () => {
  it("slerps along the great circle, also between opposite points", () => {
    const a = unitVector(0, 0);
    const b = unitVector(90, 0);
    const m = slerp(a, b, 0.5);
    expect(angleBetween(m, unitVector(45, 0))).toBeLessThan(1e-5);
    const opposite = slerp(a, unitVector(180, 0), 0.5);
    expect(angleBetween(opposite, a)).toBeCloseTo(90, 5);
    expect(slerp(a, b, 1)).toEqual(b);
  });

  it("draws the figure north up, east left, within the card", () => {
    // Three stars: one north of the centre, one east, one west.
    const dirs: Record<number, Vec3> = {
      1: unitVector(90, 10),
      2: unitVector(100, 0),
      3: unitVector(80, 0),
    };
    const s = silhouette([[1, 2, 3]], (hip) => ({ dir: dirs[hip]!, v: 1 }), unitVector(90, 0));
    const [north, east, west] = s.stars;
    expect(north![1]).toBeLessThan(east![1]); // up on screen
    expect(east![0]).toBeLessThan(west![0]); // east on the left
    for (const [x, y] of s.stars) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    expect(s.segments).toHaveLength(2);
  });
});

// The real catalogue (public/data, gitignored: skipped when absent).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs && ["stars.bin", "star-strings.json"].every((f) => fs.existsSync(data(f)));

describe.skipIf(!available)("boundaries against the catalogue's constellations (public/data)", () => {
  it("puts ≥ 99.5 % of the stars in the constellation of stars.bin", () => {
    const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const stars = decodeStarCatalog(buffer, JSON.parse(text("star-strings.json")) as StarStrings);
    const bounds = parseConstellationBounds(boundsFile as ConstellationBoundsFile);
    const differ: string[] = [];
    for (const s of stars) {
      const con = constellationAt(bounds, unitVector(s.ra, s.dec));
      if (con !== s.con) differ.push(`HIP ${s.hip} ${s.con}→${con}`);
    }
    expect(stars.length).toBeGreaterThan(8000);
    // stars.bin's `con` comes from astropy (Roman 1987), which precesses through the GCRS and so
    // adds the annual aberration (≤ 20.5″): only stars that close to a boundary may differ.
    expect(differ.length / stars.length, differ.join(", ")).toBeLessThan(0.005);
  });
});
