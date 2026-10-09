import { describe, expect, it } from "vitest";
import { unitVector, type Vec3 } from "@asteria/astro-core";
import {
  FIGURE_GRID,
  VERTICES_PER_FIGURE,
  buildFigureBuffers,
  figureDensity,
  figureDirection,
  fillDirections,
  fitFigure,
  parseFigureSet,
  type FigureFrame,
  type FigureSetManifest,
} from "./figures";
import { figureFrag, figureVert } from "./figure-shaders";

/** Angle between two directions (atan2 form: accurate for tiny angles, unlike acos). */
const angle = (a: Vec3, b: Vec3) =>
  Math.atan2(
    Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]),
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  );
const ARCSEC = Math.PI / 180 / 3600;

/**
 * Orion in the Stellarium "western" set (pinned commit of build_figures.py): anchors χ¹ Ori
 * (HIP 27913), κ Ori / Saiph (27366) and π³ Ori (22449). J2000 positions (Hipparcos, as given by
 * SIMBAD): χ¹ 05h54m22.98s +20°16′34.2″, κ 05h47m45.39s −09°40′10.6″, π³ 04h49m50.41s
 * +06°57′40.6″; Betelgeuse 05h55m10.31s +07°24′25.4″, Rigel 05h14m32.27s −08°12′05.9″.
 */
const ORION = {
  dirs: [
    unitVector(88.59576, 20.27617),
    unitVector(86.93912, -9.66961),
    unitVector(72.46004, 6.96128),
  ],
  uvs: [
    [0.115234, 0.021484],
    [0.642578, 0.931641],
    [0.822266, 0.177734],
  ],
} as const;
const BETELGEUSE = unitVector(88.79294, 7.40706);
const RIGEL = unitVector(78.63447, -8.20164);

/** Image point (u, v) of a direction: inverse of the affine fit (tests only). */
function imagePoint(frame: FigureFrame, d: Vec3): [number, number] {
  const { centre: c, e1, e2, coef: k } = frame;
  const w = d[0] * c[0] + d[1] * c[1] + d[2] * c[2];
  const x = (d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]) / w - k[2];
  const y = (d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]) / w - k[5];
  const det = k[0] * k[4] - k[1] * k[3];
  return [(x * k[4] - y * k[1]) / det, (k[0] * y - k[3] * x) / det];
}

describe("fitFigure", () => {
  it("puts the anchor stars exactly on their image points (Orion)", () => {
    const frame = fitFigure([...ORION.dirs], ORION.uvs)!;
    expect(frame).not.toBeNull();
    ORION.uvs.forEach(([u, v], i) => {
      const d = figureDirection(frame, u, v, [0, 0, 0]);
      expect(angle(d, ORION.dirs[i]!)).toBeLessThan(1e-3 * ARCSEC);
    });
  });

  it("is exact for random anchor triangles all over the sky", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 200; n++) {
      const ra = rnd() * 360;
      const dec = -85 + rnd() * 170;
      const dirs = [0, 1, 2].map(() =>
        unitVector(ra + (rnd() - 0.5) * 40, Math.max(-89, Math.min(89, dec + (rnd() - 0.5) * 40))),
      ) as [Vec3, Vec3, Vec3];
      const uvs = [0, 1, 2].map(() => [rnd(), rnd()] as [number, number]);
      const frame = fitFigure(dirs, uvs);
      if (!frame) continue; // degenerate draw
      uvs.forEach(([u, v], i) =>
        expect(angle(figureDirection(frame, u, v, [0, 0, 0]), dirs[i]!)).toBeLessThan(
          0.01 * ARCSEC,
        ),
      );
    }
  });

  it("refuses collinear anchors, in the image or on the sky", () => {
    expect(
      fitFigure(
        [...ORION.dirs],
        [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ],
      ),
    ).toBeNull();
    const line = [unitVector(10, 0), unitVector(20, 0), unitVector(30, 0)] as [Vec3, Vec3, Vec3];
    expect(fitFigure(line, ORION.uvs)).toBeNull();
  });

  it("places the other stars of Orion on the figure (not mirrored)", () => {
    const frame = fitFigure([...ORION.dirs], ORION.uvs)!;
    // Betelgeuse on the shoulder of the raised arm (left of the image), Rigel at the right foot.
    const [bu, bv] = imagePoint(frame, BETELGEUSE);
    expect(bu).toBeCloseTo(0.31, 1);
    expect(bv).toBeCloseTo(0.43, 1);
    const [ru, rv] = imagePoint(frame, RIGEL);
    expect(ru).toBeCloseTo(0.88, 1);
    expect(rv).toBeCloseTo(0.75, 1);
  });

  it("keeps the image nearly conformal (equal scales along u and v)", () => {
    const frame = fitFigure([...ORION.dirs], ORION.uvs)!;
    const at = (u: number, v: number) => figureDirection(frame, u, v, [0, 0, 0]);
    const du = angle(at(0.5, 0.5), at(0.6, 0.5));
    const dv = angle(at(0.5, 0.5), at(0.5, 0.6));
    expect(du / dv).toBeGreaterThan(0.8);
    expect(du / dv).toBeLessThan(1.25);
  });
});

const manifest = (figures: FigureSetManifest["figures"]): unknown => ({
  format: "asteria-figure-set",
  version: 1,
  id: "test",
  name: "test",
  culture: "western",
  era: "contemporary",
  author: "nobody",
  license: { name: "FAL 1.3", url: "https://artlibre.org/licence/lal/en/" },
  dataLicense: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  source: { repository: "r", commit: "c", path: "p", url: "u" },
  modifications: "",
  attribution: "",
  atlas: { file: "test.webp", width: 512, height: 256, cell: 256 },
  figures,
});

const ORI_ENTRY = {
  con: "Ori",
  id: "CON western Ori",
  file: "orion.webp",
  rect: [264, 8, 240, 240] as [number, number, number, number],
  anchors: ORION.uvs.map(([u, v], i) => ({ hip: [27913, 27366, 22449][i]!, u, v })),
};

describe("figure set manifest and mesh", () => {
  it("parses a manifest and rejects malformed ones", () => {
    expect(parseFigureSet(manifest([ORI_ENTRY])).figures).toHaveLength(1);
    expect(() => parseFigureSet({ format: "x" })).toThrow();
    expect(() => parseFigureSet(manifest([{ ...ORI_ENTRY, anchors: [] }]))).toThrow();
  });

  it("builds one grid per figure whose anchors are known, in the atlas cell", () => {
    const set = parseFigureSet(manifest([ORI_ENTRY, { ...ORI_ENTRY, con: "Tel", anchors: [
      { hip: 1, u: 0, v: 0 }, { hip: 2, u: 1, v: 0 }, { hip: 91589, u: 0, v: 1 },
    ] }])); // prettier-ignore
    const { buffers, missing } = buildFigureBuffers(set, (hip) => hip !== 91589);
    expect(missing).toEqual(["Tel"]);
    expect(buffers.cons).toEqual(["Ori"]);
    expect(buffers.dirs).toHaveLength(3 * VERTICES_PER_FIGURE);
    expect(buffers.index).toHaveLength(FIGURE_GRID * FIGURE_GRID * 6);
    expect(Math.max(...buffers.index)).toBe(VERTICES_PER_FIGURE - 1);
    // First vertex = top-left corner of the cell, last = bottom-right (texture coordinates).
    expect([...buffers.uvs.slice(0, 2)]).toEqual([264 / 512, 8 / 256]);
    expect(buffers.uvs[2 * VERTICES_PER_FIGURE - 2]).toBeCloseTo(504 / 512, 6);
    expect(buffers.uvs[2 * VERTICES_PER_FIGURE - 1]).toBeCloseTo(248 / 256, 6);
    // The reveal starts at the anchors.
    expect(Math.min(...buffers.seed)).toBeLessThan(0.1);
  });

  it("fills unit directions through the fitted frame, and collapses unplaceable figures", () => {
    const set = parseFigureSet(manifest([ORI_ENTRY]));
    const { buffers } = buildFigureBuffers(set, () => true);
    const stars = new Map(ORI_ENTRY.anchors.map((a, i) => [a.hip, ORION.dirs[i]!]));
    expect(fillDirections(buffers, (hip) => stars.get(hip))).toEqual([]);
    const frame = fitFigure([...ORION.dirs], ORION.uvs)!;
    const j = 5 * (FIGURE_GRID + 1) + 3; // row 5, column 3
    const expected = figureDirection(frame, 3 / FIGURE_GRID, 5 / FIGURE_GRID, [0, 0, 0]);
    const got: Vec3 = [buffers.dirs[3 * j]!, buffers.dirs[3 * j + 1]!, buffers.dirs[3 * j + 2]!];
    expect(angle(got, expected)).toBeLessThan(1e-6); // Float32 storage
    expect(fillDirections(buffers, () => undefined)).toEqual(["Ori"]);
    expect(buffers.dirs.every((x) => x === 0)).toBe(true);
  });
});

describe("figure density", () => {
  it("shows more in Découverte, less in Expert, and thins out in wide fields", () => {
    expect(figureDensity(60, "discovery")).toBeGreaterThan(figureDensity(60, "amateur"));
    expect(figureDensity(60, "amateur")).toBeGreaterThan(figureDensity(60, "expert"));
    expect(figureDensity(200, "amateur")).toBeLessThan(figureDensity(70, "amateur"));
    expect(figureDensity(30, "amateur")).toBe(figureDensity(70, "amateur"));
  });
});

describe("figure shaders", () => {
  const varyings = (src: string) =>
    [...src.matchAll(/varying\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
  it("declares in the vertex shader every varying the fragment shader reads", () => {
    const declared = new Set(varyings(figureVert));
    for (const name of varyings(figureFrag)) expect(declared).toContain(name);
  });
  it("uses the map's projection, horizon and 1-bit Bayer dithering", () => {
    expect(figureVert).toContain("projectView(v)");
    expect(figureFrag).toContain("uBelowAlpha");
    expect(figureFrag).toContain("bayer8(gl_FragCoord.xy / uDpr)");
  });
});
