import { describe, expect, it } from "vitest";
import { unitVector } from "@asteria/astro-core";
import { CONSTELLATION_LATIN } from "@asteria/content";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { constellationShapes, type ConstellationShape } from "./geometry";
import { DISCOVERY_CONSTELLATIONS } from "./pool";
import { emptyProgress } from "./progress";
import { mulberry32 } from "./rng";
import {
  AUTO_HINT_ERRORS,
  MAX_SEGMENTS,
  attempt,
  buildConnectSeries,
  connectable,
  figureSegments,
  gradeOf,
  isComplete,
  needsHint,
  newTrace,
  nextHint,
  segmentKey,
  snap,
  withHint,
  withSolution,
  type Segment,
} from "./connect-stars";

// Cassiopeia's « W » as the map draws it: 5 stars, 4 segments (HIP).
const CAS = [[8886, 6686, 4427, 3179, 746]];
const all = () => true;

describe("segments", () => {
  it("are unordered pairs, each once, smaller HIP first", () => {
    const segs = figureSegments(
      [
        [3, 1, 2],
        [2, 1],
        [1, 3, 3],
      ],
      all,
    );
    expect(segs).toEqual([
      [1, 3],
      [1, 2],
    ]);
    expect(segmentKey(5, 2)).toBe(segmentKey(2, 5));
  });

  it("leave out stars the catalogue lacks", () => {
    expect(figureSegments(CAS, (h) => h !== 4427)).toEqual([
      [6686, 8886],
      [746, 3179],
    ]);
  });
});

describe("tracing", () => {
  const segs = figureSegments(CAS, all);

  it("accepts a segment either way, once", () => {
    let t = newTrace(segs);
    let r = attempt(t, 6686, 8886);
    expect(r.result).toBe("found");
    t = r.trace;
    r = attempt(t, 8886, 6686);
    expect(r.result).toBe("again");
    expect(r.trace).toBe(t);
    expect(attempt(t, 746, 746).result).toBe("same");
    expect(t.found.size).toBe(1);
  });

  it("counts wrong segments and offers a hint after a streak", () => {
    let t = newTrace(segs);
    for (let i = 0; i < AUTO_HINT_ERRORS; i++) {
      expect(needsHint(t)).toBe(false);
      t = attempt(t, 8886, 746).trace; // not a segment of the W
    }
    expect(t.errors).toBe(AUTO_HINT_ERRORS);
    expect(needsHint(t)).toBe(true);
    t = withHint(t);
    expect(needsHint(t)).toBe(false);
    expect(t.hints).toBe(1);
    t = attempt(t, 8886, 746).trace;
    t = attempt(t, 6686, 8886).trace; // a right one clears the streak
    expect(t.streak).toBe(0);
    expect(t.errors).toBe(AUTO_HINT_ERRORS + 1);
  });

  it("completes when every segment is found, in any order", () => {
    let t = newTrace(segs);
    for (const [a, b] of [...segs].reverse()) t = attempt(t, b, a).trace;
    expect(isComplete(t)).toBe(true);
    expect(gradeOf(t)).toBe("good");
  });

  it("grades laboured and revealed traces", () => {
    let t = newTrace(segs);
    for (let i = 0; i < 3; i++) t = attempt(t, 8886, 746).trace;
    for (const [a, b] of segs) t = attempt(t, a, b).trace;
    expect(gradeOf(t)).toBe("hard"); // 3 errors
    let h = withHint(newTrace(segs));
    for (const [a, b] of segs) h = attempt(h, a, b).trace;
    expect(gradeOf(h)).toBe("hard"); // a hint
    const s = withSolution(attempt(newTrace(segs), 8886, 6686).trace);
    expect(isComplete(s)).toBe(true);
    expect(gradeOf(s)).toBe("again");
  });
});

describe("hints", () => {
  const segs = figureSegments(CAS, all);

  it("start from the selected star when it has a segment left", () => {
    expect(nextHint(newTrace(segs), 3179)).toEqual({ from: 3179, to: 4427 });
  });

  it("continue the trace, else start anywhere", () => {
    let t = attempt(newTrace(segs), 8886, 6686).trace;
    expect(nextHint(t, null)).toEqual({ from: 6686, to: 4427 });
    expect(nextHint(newTrace(segs), null)).toEqual({ from: 6686, to: 8886 });
    for (const [a, b] of segs) t = attempt(t, a, b).trace;
    expect(nextHint(t, null)).toBeNull();
  });
});

describe("snapping", () => {
  const stars = [
    { hip: 1, x: 100, y: 100 },
    { hip: 2, x: 130, y: 100 },
  ];
  it("picks the nearest star within the radius", () => {
    expect(snap(112, 100, stars, 30)).toBe(1);
    expect(snap(118, 104, stars, 30)).toBe(2);
    expect(snap(200, 200, stars, 30)).toBeNull();
    expect(snap(100, 129, stars, 30)).toBe(1);
    expect(snap(100, 131, stars, 30)).toBeNull();
  });
});

describe("playable figures", () => {
  const seg = (n: number): Segment[] => Array.from({ length: n }, (_, i) => [i + 1, i + 2]);
  const bright = () => 3;

  it("need 2 to the level's maximum segments", () => {
    expect(connectable(seg(1), bright, 5, "expert")).toBe(false);
    expect(connectable(seg(2), bright, 5, "discovery")).toBe(true);
    expect(connectable(seg(12), bright, 5, "discovery")).toBe(true);
    expect(connectable(seg(13), bright, 5, "discovery")).toBe(false);
    expect(connectable(seg(20), bright, 5, "amateur")).toBe(true);
    expect(connectable(seg(21), bright, 5, "amateur")).toBe(false);
    expect(connectable(seg(30), bright, 5, "expert")).toBe(true);
    expect(MAX_SEGMENTS.discovery).toBe(12);
  });

  it("need every star drawn at the framing field", () => {
    expect(connectable(seg(4), () => 5.9, 5, "amateur")).toBe(true); // small field: deep limit
    expect(connectable(seg(4), () => 5.9, 30, "amateur")).toBe(false); // wide field
  });
});

describe("series", () => {
  // Stand-in figures: every constellation a 4-segment chain, spread over the sphere.
  const abbrs = Object.keys(CONSTELLATION_LATIN);
  const shapes: Record<string, ConstellationShape> = Object.fromEntries(
    abbrs.map((abbr, i) => {
      const dec = (Math.asin(1 - (2 * (i + 0.5)) / abbrs.length) * 180) / Math.PI;
      return [abbr, { abbr, centre: unitVector((i * 137.5) % 360, dec), radius: 8 }];
    }),
  );
  const figures = Object.fromEntries(
    abbrs.map((a, i) => [
      a,
      a === "Cas" ? figureSegments(CAS, all) : seg4(i * 10 + 1, a === "Ori" ? 24 : 4),
    ]),
  );
  function seg4(start: number, n: number): Segment[] {
    return Array.from({ length: n }, (_, k) => [start + k, start + k + 1]);
  }

  it("draws 5 playable constellations of the level, reproducibly", () => {
    const opts = {
      level: "discovery" as const,
      figures,
      shapes,
      magnitudes: () => 3,
      progress: emptyProgress(),
      now: Date.UTC(2026, 9, 19),
    };
    const a = buildConnectSeries({ ...opts, rng: mulberry32(4) });
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);
    for (const abbr of a) expect(DISCOVERY_CONSTELLATIONS).toContain(abbr);
    expect(a).not.toContain("Ori"); // 24 segments
    expect(buildConnectSeries({ ...opts, rng: mulberry32(4) })).toEqual(a);
    for (let seed = 1; seed < 30; seed++)
      expect(
        buildConnectSeries({ ...opts, level: "amateur", rng: mulberry32(seed) }),
      ).not.toContain("Ori");
  });
});

// The real figures (public/data, gitignored: skipped when absent): enough to play at each level.
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs &&
  ["stars.bin", "star-strings.json", "constellation-lines.json"].every((f) =>
    fs.existsSync(data(f)),
  );

describe.skipIf(!available)("real figures (public/data)", () => {
  it("leave enough playable constellations, and the expected ones out", () => {
    const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const stars = decodeStarCatalog(buffer, JSON.parse(text("star-strings.json")) as StarStrings);
    const lines = JSON.parse(text("constellation-lines.json")) as Record<string, number[][]>;
    const byHip = new Map(stars.map((s) => [s.hip, s]));
    const shapes = constellationShapes(stars, lines);
    const playable = (level: "discovery" | "amateur" | "expert") =>
      Object.keys(lines).filter((abbr) =>
        connectable(
          figureSegments(lines[abbr]!, (h) => byHip.has(h)),
          (h) => byHip.get(h)!.v,
          shapes[abbr]!.radius,
          level,
        ),
      );
    const discovery = playable("discovery").filter((a) => DISCOVERY_CONSTELLATIONS.includes(a));
    expect(discovery.length).toBeGreaterThanOrEqual(12);
    for (const a of ["Cas", "Lyr", "Cyg", "Leo", "Sco", "Aql"]) expect(discovery).toContain(a);
    expect(discovery).not.toContain("CMi"); // a single stroke
    expect(discovery).not.toContain("Ori"); // 24 segments
    expect(playable("amateur").length).toBeGreaterThanOrEqual(50);
    expect(playable("expert")).not.toContain("Psc"); // faint stars at its wide field
  });
});
