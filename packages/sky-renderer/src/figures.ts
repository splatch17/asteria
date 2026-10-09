/**
 * Illustrated constellation figures (#95, #96): the "constellationFigures" layer of the sky map.
 *
 * Set-agnostic: a figure set is an atlas of greyscale cells (luminance = ink coverage) and a JSON
 * manifest ("asteria-figure-set" v1, written by packages/sky-data/build_figures.py) giving, per
 * figure, its constellation, its cell in the atlas and three anchors {hip, u, v}: the point (u, v)
 * of the image (top-left origin, v downwards) lies on the star HIP.
 *
 * Placement (fitFigure): an affine map from the image (u, v) to the gnomonic tangent plane at the
 * normalised barycentre of the three anchor stars, exact at the anchors. Each figure is a GRID×GRID
 * quad mesh whose vertices are sent from that plane to the unit sphere (J2000 directions), so the
 * GPU projection (stereographic, like the stars) bends the image with the map. The anchors follow
 * the stars' proper motion: the meshes are refitted when the date moves by REFIT_YEARS.
 *
 * Cost: one draw call for the whole set (merged geometry, 85 × 17² vertices for set 1), an R8
 * atlas texture loaded on demand the first time the layer is on, no allocation per frame.
 */
import * as THREE from "three";
import type { Vec3 } from "@asteria/astro-core";
import { figureFrag, figureVert } from "./figure-shaders";

export const FIGURE_SET_FORMAT = "asteria-figure-set";

export interface FigureAnchor {
  hip: number;
  /** Position in the figure's own image, in [0, 1], top-left origin. */
  u: number;
  v: number;
}

export interface FigureEntry {
  /** IAU abbreviation of the constellation. */
  con: string;
  /** Identifier in the source (e.g. "CON western Ori"). */
  id: string;
  /** Source file, for provenance. */
  file: string;
  /** Cell of the figure in the atlas: x, y, width, height (px, top-left origin). */
  rect: [number, number, number, number];
  anchors: FigureAnchor[];
}

export interface FigureSetManifest {
  format: typeof FIGURE_SET_FORMAT;
  version: 1;
  id: string;
  name: string;
  culture: string;
  era: string;
  author: string;
  license: { name: string; url: string };
  dataLicense: { name: string; url: string };
  source: { repository: string; commit: string; path: string; url: string };
  modifications: string;
  attribution: string;
  atlas: { file: string; width: number; height: number; cell: number };
  figures: FigureEntry[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Checks a manifest's shape (format, version, figures, anchors); throws on anything else. */
export function parseFigureSet(json: unknown): FigureSetManifest {
  const m = json as Partial<FigureSetManifest> | null;
  if (!m || m.format !== FIGURE_SET_FORMAT || m.version !== 1)
    throw new Error("not an asteria-figure-set v1 manifest");
  const atlas = m.atlas;
  if (!atlas || !isNum(atlas.width) || !isNum(atlas.height) || typeof atlas.file !== "string")
    throw new Error("figure set: bad atlas");
  if (!Array.isArray(m.figures)) throw new Error("figure set: no figures");
  for (const f of m.figures) {
    const ok =
      typeof f?.con === "string" &&
      Array.isArray(f.rect) &&
      f.rect.length === 4 &&
      f.rect.every(isNum) &&
      Array.isArray(f.anchors) &&
      f.anchors.length === 3 &&
      f.anchors.every((a) => Number.isInteger(a?.hip) && isNum(a.u) && isNum(a.v));
    if (!ok) throw new Error(`figure set: bad figure ${String(f?.con)}`);
  }
  return m as FigureSetManifest;
}

/**
 * Placement of a figure on the sky: tangent plane at `centre` (unit vector) with basis (e1, e2);
 * gnomonic coordinates x = a·u + b·v + c, y = d·u + e·v + f.
 */
export interface FigureFrame {
  centre: Vec3;
  e1: Vec3;
  e2: Vec3;
  coef: [number, number, number, number, number, number];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= n;
  v[1] /= n;
  v[2] /= n;
  return v;
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Smallest |determinant| accepted for the anchor triangles (image and gnomonic plane). */
const DEGENERATE = 1e-6;

/**
 * Affine fit of a figure on its three anchor stars (unit vectors, any frame): exact at the
 * anchors, null when the anchors are collinear in the image or on the sky, or not on the same
 * hemisphere as their barycentre.
 */
export function fitFigure(
  dirs: readonly [Vec3, Vec3, Vec3],
  uvs: readonly (readonly [number, number])[],
): FigureFrame | null {
  const centre = normalize([
    dirs[0][0] + dirs[1][0] + dirs[2][0],
    dirs[0][1] + dirs[1][1] + dirs[2][1],
    dirs[0][2] + dirs[1][2] + dirs[2][2],
  ]);
  // Tangent basis: e1 towards increasing RA (East), e2 towards the pole (or any basis near it).
  const pole: Vec3 = Math.abs(centre[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = normalize(cross(pole, centre));
  const e2 = cross(centre, e1);
  const xy: [number, number][] = [];
  for (const d of dirs) {
    const w = dot(d, centre);
    if (w < 0.05) return null; // ≥ 87° from the barycentre: no usable tangent plane
    xy.push([dot(d, e1) / w, dot(d, e2) / w]);
  }
  const [[u0, v0], [u1, v1], [u2, v2]] = uvs as [
    [number, number],
    [number, number],
    [number, number],
  ];
  // Solve [u v 1] · [a d; b e; c f] = [x y] for the three anchors (Cramer's rule).
  const det = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
  const [[x0, y0], [x1, y1], [x2, y2]] = xy as [
    [number, number],
    [number, number],
    [number, number],
  ];
  const sky = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < DEGENERATE || Math.abs(sky) < DEGENERATE) return null;
  const solve = (p0: number, p1: number, p2: number): [number, number, number] => [
    (p0 * (v1 - v2) - v0 * (p1 - p2) + (p1 * v2 - p2 * v1)) / det,
    (u0 * (p1 - p2) - p0 * (u1 - u2) + (u1 * p2 - u2 * p1)) / det,
    (u0 * (v1 * p2 - v2 * p1) - v0 * (u1 * p2 - u2 * p1) + p0 * (u1 * v2 - u2 * v1)) / det,
  ];
  const [a, b, c] = solve(x0, x1, x2);
  const [d, e, f] = solve(y0, y1, y2);
  return { centre, e1, e2, coef: [a, b, c, d, e, f] };
}

/** Unit vector of the image point (u, v) of a fitted figure, written into `out`. */
export function figureDirection(frame: FigureFrame, u: number, v: number, out: Vec3): Vec3 {
  const { centre: c, e1, e2, coef: k } = frame;
  const x = k[0] * u + k[1] * v + k[2];
  const y = k[3] * u + k[4] * v + k[5];
  out[0] = c[0] + x * e1[0] + y * e2[0];
  out[1] = c[1] + x * e1[1] + y * e2[1];
  out[2] = c[2] + x * e1[2] + y * e2[2];
  return normalize(out);
}

/** Quads per side of a figure's mesh: enough for the projection to bend a 90° figure smoothly. */
export const FIGURE_GRID = 16;
const SIDE = FIGURE_GRID + 1;
export const VERTICES_PER_FIGURE = SIDE * SIDE;

/** Static buffers of the merged figure mesh (directions are filled by fillDirections). */
export interface FigureBuffers {
  /** Constellations drawn, in mesh order (aFig = index). */
  cons: string[];
  /** The figures kept, same order. */
  figures: FigureEntry[];
  dirs: Float32Array;
  uvs: Float32Array;
  fig: Float32Array;
  seed: Float32Array;
  index: Uint16Array | Uint32Array;
}

/**
 * Buffers of the figures whose three anchors are known (`has(hip)`); the others are left out
 * and returned in `missing`.
 */
export function buildFigureBuffers(
  manifest: FigureSetManifest,
  has: (hip: number) => boolean,
): { buffers: FigureBuffers; missing: string[] } {
  const figures = manifest.figures.filter((f) => f.anchors.every((a) => has(a.hip)));
  const missing = manifest.figures.filter((f) => !figures.includes(f)).map((f) => f.con);
  const n = figures.length * VERTICES_PER_FIGURE;
  const uvs = new Float32Array(2 * n);
  const fig = new Float32Array(n);
  const seed = new Float32Array(n);
  const quads = FIGURE_GRID * FIGURE_GRID;
  const index =
    n > 65535
      ? new Uint32Array(figures.length * quads * 6)
      : new Uint16Array(figures.length * quads * 6);
  const { width: W, height: H } = manifest.atlas;
  let k = 0;
  figures.forEach((f, i) => {
    const [rx, ry, rw, rh] = f.rect;
    const base = i * VERTICES_PER_FIGURE;
    for (let row = 0; row < SIDE; row++)
      for (let col = 0; col < SIDE; col++) {
        const j = base + row * SIDE + col;
        const u = col / FIGURE_GRID;
        const v = row / FIGURE_GRID;
        // Atlas texture coordinates, top-left origin (the texture is uploaded without flipY).
        uvs[2 * j] = (rx + u * rw) / W;
        uvs[2 * j + 1] = (ry + v * rh) / H;
        fig[j] = i;
        let near = Infinity;
        for (const a of f.anchors) near = Math.min(near, Math.hypot(u - a.u, v - a.v));
        seed[j] = Math.min(1, near / 0.75);
      }
    for (let row = 0; row < FIGURE_GRID; row++)
      for (let col = 0; col < FIGURE_GRID; col++) {
        const a = base + row * SIDE + col;
        const b = a + 1;
        const c = a + SIDE;
        const d = c + 1;
        index.set([a, c, b, b, c, d], k);
        k += 6;
      }
  });
  return {
    buffers: {
      cons: figures.map((f) => f.con),
      figures,
      dirs: new Float32Array(3 * n),
      uvs,
      fig,
      seed,
      index,
    },
    missing,
  };
}

/**
 * Writes the J2000 directions of every mesh vertex, figures fitted on the current anchor
 * directions. A figure that cannot be fitted is collapsed (zero vectors: never drawn). Returns
 * the constellations that failed. Allocation-light: one frame object per figure.
 */
export function fillDirections(
  buffers: FigureBuffers,
  star: (hip: number) => Vec3 | undefined,
  scratch: Vec3 = [0, 0, 0],
): string[] {
  const failed: string[] = [];
  buffers.figures.forEach((f, i) => {
    const [a, b, c] = f.anchors as [FigureAnchor, FigureAnchor, FigureAnchor];
    const da = star(a.hip);
    const db = star(b.hip);
    const dc = star(c.hip);
    const frame =
      da && db && dc
        ? fitFigure(
            [da, db, dc],
            [
              [a.u, a.v],
              [b.u, b.v],
              [c.u, c.v],
            ],
          )
        : null;
    const base = i * VERTICES_PER_FIGURE;
    if (!frame) {
      failed.push(f.con);
      buffers.dirs.fill(0, 3 * base, 3 * (base + VERTICES_PER_FIGURE));
      return;
    }
    for (let row = 0; row < SIDE; row++)
      for (let col = 0; col < SIDE; col++) {
        const j = 3 * (base + row * SIDE + col);
        figureDirection(frame, col / FIGURE_GRID, row / FIGURE_GRID, scratch);
        buffers.dirs[j] = scratch[0];
        buffers.dirs[j + 1] = scratch[1];
        buffers.dirs[j + 2] = scratch[2];
      }
  });
  return failed;
}

/** Public levels (Découverte shows the figures more, Expert keeps them in retreat). */
export type FigureLevel = "discovery" | "amateur" | "expert";

const LEVEL_DENSITY: Record<FigureLevel, number> = { discovery: 0.72, amateur: 0.56, expert: 0.44 };

/**
 * Ink coverage of the figures for a field of view (degrees) and a level: full up to 70°, then
 * thinner towards the widest fields, where many figures share the screen.
 */
export function figureDensity(fov: number, level: FigureLevel): number {
  const t = Math.min(1, Math.max(0, (fov - 70) / 110));
  return LEVEL_DENSITY[level] * (1 - 0.45 * t * t * (3 - 2 * t));
}

/** Duration of the reveal (ms). */
export const FIGURE_REVEAL_MS = 1400;
/** Proper motion: refit the figures when the date moved by this many years. */
const REFIT_YEARS = 25;

let reducedMotion: MediaQueryList | null | undefined;
/** prefers-reduced-motion (the query object is created once, then read every frame). */
function prefersReducedMotion(): boolean {
  if (reducedMotion === undefined)
    reducedMotion =
      typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return reducedMotion?.matches ?? false;
}
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export interface FigureLayerOptions {
  /** Shared uniforms of the map (projection, ink, horizon, pixel ratio). */
  uniforms: Record<string, THREE.IUniform>;
  /** URL of the figure set's manifest; the atlas is next to it. Absent: layer unavailable. */
  url?: string | undefined;
  /** Current J2000 direction of a catalogue star (kept up to date with the proper motion). */
  starDirection: (hip: number) => Vec3 | undefined;
  /** Asks the map for a frame (texture ready). */
  requestFrame: () => void;
}

/** The figure layer of the sky map: add `object` to the scene, drive it with the setters. */
export class FigureLayer {
  /** Scene node; the figure mesh is added to it once the set is loaded. */
  readonly object = new THREE.Group();
  private enabled = false;
  private state: "idle" | "loading" | "ready" | "failed" = "idle";
  private mesh: THREE.Mesh | null = null;
  private buffers: FigureBuffers | null = null;
  private level: FigureLevel = "amateur";
  private selected: string | null = null;
  private revealStart = -Infinity;
  private selStart = -Infinity;
  private fittedYears = NaN;
  private readonly scratch: Vec3 = [0, 0, 0];
  private readonly uniforms: Record<string, THREE.IUniform>;
  private disposed = false;

  constructor(private readonly options: FigureLayerOptions) {
    this.uniforms = {
      ...options.uniforms,
      uAtlas: { value: null },
      uDensity: { value: 0.5 },
      uAlpha: { value: 0.5 },
      uReveal: { value: 1 },
      uSelected: { value: -1 },
      uSelReveal: { value: 1 },
      uSelDensity: { value: 0.92 },
      uSelAlpha: { value: 0.85 },
      uOthers: { value: 1 },
    };
    this.object.visible = false;
  }

  /** The set is loaded and drawable. */
  get ready(): boolean {
    return this.state === "ready";
  }

  /** Switches the layer; the first time, loads the set (failure: layer silently unavailable). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.object.visible = on && this.state === "ready";
    if (!on) return;
    this.revealStart = performance.now();
    if (this.state === "idle") void this.load();
  }

  setLevel(level: FigureLevel): void {
    this.level = level;
    this.options.requestFrame();
  }

  /** Highlights a constellation's figure (denser, more opaque), revealed from its stars. */
  setSelected(abbr: string | null): void {
    if (abbr === this.selected) return;
    this.selected = abbr;
    this.selStart = performance.now();
    this.updateSelection();
  }

  /**
   * Per-frame update (uniforms only, allocation-free): zoom density, reveal progress and, when
   * the date moved by REFIT_YEARS, the anchors' proper motion. Returns true while animating.
   */
  update(now: number, fov: number, years: number): boolean {
    if (!this.object.visible || !this.buffers || !this.mesh) return false;
    if (!(Math.abs(years - this.fittedYears) < REFIT_YEARS)) {
      this.fittedYears = years;
      fillDirections(this.buffers, this.options.starDirection, this.scratch);
      const attr = this.mesh.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }
    const u = this.uniforms;
    u.uDensity!.value = figureDensity(fov, this.level);
    const still = prefersReducedMotion();
    const reveal = still ? 1 : Math.min(1, (now - this.revealStart) / FIGURE_REVEAL_MS);
    const sel = still ? 1 : Math.min(1, (now - this.selStart) / FIGURE_REVEAL_MS);
    u.uReveal!.value = easeOut(reveal);
    u.uSelReveal!.value = easeOut(sel);
    return reveal < 1 || (sel < 1 && this.selected !== null);
  }

  /** Stops a pending load; GPU resources are freed with the scene (disposeObjects). */
  dispose(): void {
    this.disposed = true;
  }

  private updateSelection(): void {
    const i = this.selected && this.buffers ? this.buffers.cons.indexOf(this.selected) : -1;
    this.uniforms.uSelected!.value = i;
    this.uniforms.uOthers!.value = this.selected ? 0.7 : 1;
    this.options.requestFrame();
  }

  private async load(): Promise<void> {
    const { url } = this.options;
    this.state = "loading";
    try {
      if (!url) throw new Error("no figure set configured");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const manifest = parseFigureSet(await res.json());
      const atlas = await loadAtlas(new URL(manifest.atlas.file, new URL(url, location.href)).href);
      if (this.disposed) return;
      const { buffers, missing } = buildFigureBuffers(
        manifest,
        (hip) => !!this.options.starDirection(hip),
      );
      if (missing.length)
        console.warn(`Figures without their anchor stars in the catalogue: ${missing.join(", ")}`);
      const failed = fillDirections(buffers, this.options.starDirection, this.scratch);
      if (failed.length) console.warn(`Figures that cannot be placed: ${failed.join(", ")}`);
      this.buffers = buffers;
      this.mesh = this.createMesh(buffers, atlas);
      this.object.add(this.mesh);
      this.state = "ready";
      this.object.visible = this.enabled;
      this.revealStart = performance.now();
      this.updateSelection();
    } catch (e) {
      this.state = "failed";
      console.warn("Constellation figures unavailable:", e);
    }
  }

  private createMesh(b: FigureBuffers, atlas: THREE.Texture): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    const dirs = new THREE.BufferAttribute(b.dirs, 3);
    geo.setAttribute("position", dirs);
    geo.setAttribute("aDir", dirs);
    geo.setAttribute("aUv", new THREE.BufferAttribute(b.uvs, 2));
    geo.setAttribute("aFig", new THREE.BufferAttribute(b.fig, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(b.seed, 1));
    geo.setIndex(new THREE.BufferAttribute(b.index, 1));
    this.uniforms.uAtlas!.value = atlas;
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: figureVert,
      fragmentShader: figureFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    // Under the lines and stars (renderOrder 0), over the see-through ground (−1).
    mesh.renderOrder = -0.5;
    return mesh;
  }
}

/** Decodes the atlas into a single-channel (R8) texture: 1 byte per texel on the GPU. */
async function loadAtlas(url: string): Promise<THREE.DataTexture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("no 2D context to decode the figure atlas");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const red = new Uint8Array(width * height);
  for (let i = 0; i < red.length; i++) red[i] = rgba[4 * i]!;
  const texture = new THREE.DataTexture(
    red,
    width,
    height,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
