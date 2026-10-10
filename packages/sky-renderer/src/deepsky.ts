/**
 * Deep-sky layer of the sky map (#101): Messier and bright NGC/IC objects drawn as engraved glyphs
 * (deepsky-style.ts, deepsky-shaders.ts) in one instanced draw call, precessed and projected on
 * the GPU like the stars. The CPU side keeps what labels, picking and the selection marker need,
 * with the same visibility rule as the shader; nothing is allocated per frame for the glyphs.
 *
 * The objects come from the caller (the app decodes `deepsky.json` of @asteria/catalog and adds
 * the localised names), so the renderer stays independent of the catalogue format.
 */
import * as THREE from "three";
import { unitVector, type Mat3, type Vec3 } from "@asteria/astro-core";
import {
  DEEP_SKY_STYLE,
  deepSkyDayLimit,
  deepSkyLimit,
  glyphAxes,
  glyphLabelled,
  glyphParams,
  glyphVisibility,
  majorAxisDirection,
  type GlyphParams,
  type GlyphSource,
} from "./deepsky-style";
import { deepSkyFrag, deepSkyVert } from "./deepsky-shaders";
import { dayInkAlpha } from "./daylight";

/** A deep-sky object as the map draws it. */
export interface DeepSkyMapObject extends GlyphSource {
  /** Catalogue identifier ("M31", "NGC869"…), handed back on selection. */
  id: string;
  /** ICRS J2000, degrees. */
  ra: number;
  dec: number;
  /** Short label: the first designation ("M 31", "NGC 869"). */
  label: string;
}

/** What the layer needs from the map to place glyphs on screen in the current frame. */
export interface DeepSkyFrame {
  /** J2000 → view frame. */
  m: Mat3;
  /** J2000 → horizontal, third row: up · dir is the sine of the altitude. */
  up: Vec3;
  /** Stereographic scale (stereoScale) and half the canvas height, CSS px. */
  scale: number;
  halfHeight: number;
  /** Limits above and below the horizon; null below when nothing is drawn there. */
  limitAbove: number;
  limitBelow: number | null;
  /** Screen position (CSS px) of a view-frame direction, null off screen; the pair is reused. */
  project: (x: number, y: number, z: number) => [number, number] | null;
}

/** A glyph on screen: centre and semi-axes (CSS px). */
export interface GlyphOnScreen {
  x: number;
  y: number;
  /** Semi-major and semi-minor axes, CSS px. */
  a: number;
  b: number;
  /** Below the horizon (dimmed). */
  below: boolean;
}

/** Tap tolerance around a glyph (CSS px): small glyphs stay easy to hit. */
export const DEEP_SKY_PICK_MIN = 16;

export class DeepSkyLayer {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly uniforms = {
    uDeepLimit: { value: 6 },
    uDeepLimitBelow: { value: 6 },
    uDeepAlpha: { value: DEEP_SKY_STYLE.ALPHA as number },
    uSelected: { value: -1 },
    uMessierOnly: { value: 0 },
  };
  private objects: readonly DeepSkyMapObject[] = [];
  private params: GlyphParams[] = [];
  /** J2000 unit vectors of the objects and of their major axes. */
  private dirs: Vec3[] = [];
  private axes: Vec3[] = [];
  /** Object indices by increasing rank: label priority. */
  private order: number[] = [];
  private readonly byId = new Map<string, number>();
  private selected = -1;
  /** Id of the selected object, kept when the objects are replaced. */
  private selectedId: string | null = null;
  /** Scratch axes of glyphAxes and glyph of forEachGlyph (no allocation per projected glyph). */
  private readonly axesPx: [number, number] = [0, 0];
  private readonly glyph: GlyphOnScreen = { x: 0, y: 0, a: 0, b: 0, below: false };

  /** `shared`: the map's uniforms (projection, ink, horizon), shared by reference. */
  constructor(shared: Record<string, THREE.IUniform>) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...this.uniforms },
      vertexShader: deepSkyVert,
      fragmentShader: deepSkyFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry([]), material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Under the stars and the figures (drawn after it), above a see-through ground (−1).
    this.mesh.renderOrder = -0.5;
  }

  /** Replaces the objects (once, when the catalogue has loaded); null or [] clears them. */
  setObjects(objects: readonly DeepSkyMapObject[] | null): void {
    this.objects = objects ?? [];
    this.params = this.objects.map(glyphParams);
    this.dirs = this.objects.map((o) => unitVector(o.ra, o.dec));
    this.axes = this.objects.map((o, i) =>
      majorAxisDirection(o.ra, o.dec, this.params[i]!.positionAngle),
    );
    this.order = this.objects.map((_, i) => i).sort((a, b) => this.rank(a) - this.rank(b));
    this.byId.clear();
    this.objects.forEach((o, i) => this.byId.set(o.id, i));
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometry(this.objects);
    this.setSelected(this.selectedId);
  }

  get count(): number {
    return this.objects.length;
  }

  object(index: number): DeepSkyMapObject | undefined {
    return this.objects[index];
  }

  indexOf(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  /** J2000 direction of an object. */
  direction(index: number): Vec3 | undefined {
    return this.dirs[index];
  }

  /** The selected object is always drawn, even beyond the limit or the level (null: none). */
  setSelected(id: string | null): void {
    this.selectedId = id;
    this.selected = id === null ? -1 : this.indexOf(id);
    this.uniforms.uSelected.value = this.selected;
  }

  /** Index of the selected object, −1 when none (or not in the objects). */
  get selectedIndex(): number {
    return this.selected;
  }

  /** Semi-major axis on screen (CSS px) of an object's glyph at view-frame depth `z`. */
  radius(index: number, z: number, scale: number, halfHeight: number): number {
    const p = this.params[index];
    return p ? glyphAxes(p, z, scale, halfHeight, this.axesPx)[0] : 0;
  }

  /** Découverte level: Messier objects only (#101). */
  setMessierOnly(on: boolean): void {
    this.uniforms.uMessierOnly.value = on ? 1 : 0;
  }

  /**
   * Limits and ink for the frame: `daylight` 0…1, `realistic` the realisticDaylight layer, `dayInk`
   * the daylight felt by the ink (0 with that layer).
   */
  setFrame(fov: number, daylight: number, realistic: boolean, dayInk: number): void {
    this.uniforms.uDeepLimit.value = deepSkyDayLimit(fov, daylight, realistic);
    this.uniforms.uDeepLimitBelow.value = deepSkyLimit(fov);
    this.uniforms.uDeepAlpha.value = dayInkAlpha(DEEP_SKY_STYLE.ALPHA, dayInk);
  }

  /** Limits currently fed to the shader (above, below the horizon). */
  limits(): { above: number; below: number } {
    return { above: this.uniforms.uDeepLimit.value, below: this.uniforms.uDeepLimitBelow.value };
  }

  /** Drawn by the shader in this frame (same rule as deepSkyVert, horizon included). */
  drawn(index: number, f: DeepSkyFrame, labelled = false): boolean {
    if (index === this.selected) return this.side(index, f) !== null;
    const o = this.objects[index];
    if (!o || (this.uniforms.uMessierOnly.value && !o.messier)) return false;
    const limit = this.side(index, f);
    if (limit === null) return false;
    const rank = this.rank(index);
    return labelled ? glyphLabelled(rank, limit) : glyphVisibility(rank, limit) > 0;
  }

  /** Limit on the object's side of the horizon, null when that side is not drawn. */
  private side(index: number, f: DeepSkyFrame): number | null {
    const d = this.dirs[index]!;
    const below = f.up[0] * d[0] + f.up[1] * d[1] + f.up[2] * d[2] <= 0;
    return below ? f.limitBelow : f.limitAbove;
  }

  private rank(index: number): number {
    return this.params[index]!.rank;
  }

  /**
   * Screen place and size of an object's glyph, or null when off screen. Allocation-free: `out`
   * is filled and returned.
   */
  onScreen(index: number, f: DeepSkyFrame, out: GlyphOnScreen): GlyphOnScreen | null {
    const d = this.dirs[index];
    if (!d) return null;
    const { m } = f;
    const z = m[6] * d[0] + m[7] * d[1] + m[8] * d[2];
    const p = f.project(
      m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
      m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
      z,
    );
    if (!p) return null;
    out.x = p[0];
    out.y = p[1];
    glyphAxes(this.params[index]!, z, f.scale, f.halfHeight, this.axesPx);
    out.a = this.axesPx[0];
    out.b = this.axesPx[1];
    out.below = f.up[0] * d[0] + f.up[1] * d[1] + f.up[2] * d[2] <= 0;
    return out;
  }

  /**
   * Object under a tap at (x, y), or −1: the drawn glyph whose ellipse (grown to
   * DEEP_SKY_PICK_MIN for small ones) holds the tap, the one where the tap is the most central
   * winning (a small object inside a large one stays reachable). Runs on taps only.
   */
  pick(x: number, y: number, f: DeepSkyFrame): number {
    let best = -1;
    let bestScore = Infinity;
    const g: GlyphOnScreen = { x: 0, y: 0, a: 0, b: 0, below: false };
    for (let i = 0; i < this.objects.length; i++) {
      if (!this.drawn(i, f) || !this.onScreen(i, f, g)) continue;
      const dx = x - g.x;
      const dy = y - g.y;
      if (Math.abs(dx) > g.a + DEEP_SKY_PICK_MIN || Math.abs(dy) > g.a + DEEP_SKY_PICK_MIN)
        continue;
      // Tap in the glyph's frame: along the major axis (projected the way the shader does).
      const [ux, uy] = this.screenAxis(i, f, g);
      const along = dx * ux + dy * uy;
      const across = -dx * uy + dy * ux;
      const a = Math.max(g.a, DEEP_SKY_PICK_MIN);
      const b = Math.max(g.b, DEEP_SKY_PICK_MIN);
      const score = Math.hypot(along / a, across / b);
      if (score <= 1 && score < bestScore) [best, bestScore] = [i, score];
    }
    return best;
  }

  /** Unit screen vector (CSS px, y down) along an object's major axis. */
  private screenAxis(index: number, f: DeepSkyFrame, g: GlyphOnScreen): [number, number] {
    const d = this.dirs[index]!;
    const t = this.axes[index]!;
    const k = 0.01;
    const [x, y, z] = [d[0] + k * t[0], d[1] + k * t[1], d[2] + k * t[2]];
    const n = Math.hypot(x, y, z);
    const { m } = f;
    const p = f.project(
      (m[0] * x + m[1] * y + m[2] * z) / n,
      (m[3] * x + m[4] * y + m[5] * z) / n,
      (m[6] * x + m[7] * y + m[8] * z) / n,
    );
    if (!p) return [0, -1];
    const dx = p[0] - g.x;
    const dy = p[1] - g.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-6 ? [dx / len, dy / len] : [0, -1];
  }

  /**
   * Calls `visit` for objects on one side of the horizon: "selected", only the selected object
   * (if drawn); "labelled", the other objects well inside the limit (glyphLabelled), by rank;
   * "drawn", every other drawn object. Allocation-free: the glyph passed is reused.
   */
  forEachGlyph(
    f: DeepSkyFrame,
    below: boolean,
    which: "selected" | "labelled" | "drawn",
    visit: (object: DeepSkyMapObject, glyph: GlyphOnScreen) => void,
  ): void {
    const g = this.glyph;
    if (which === "selected") {
      const i = this.selected;
      if (i >= 0 && this.drawn(i, f) && this.onScreen(i, f, g) && g.below === below)
        visit(this.objects[i]!, g);
      return;
    }
    const labelled = which === "labelled";
    for (const i of this.order) {
      if (i === this.selected || !this.drawn(i, f, labelled) || !this.onScreen(i, f, g)) continue;
      if (g.below === below) visit(this.objects[i]!, g);
    }
  }

  private geometry(objects: readonly DeepSkyMapObject[]): THREE.InstancedBufferGeometry {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const n = objects.length;
    const dir = new Float32Array(3 * n);
    const axis = new Float32Array(3 * n);
    const glyph = new Float32Array(4 * n);
    const info = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      const p = this.params[i]!;
      dir.set(this.dirs[i]!, 3 * i);
      axis.set(this.axes[i]!, 3 * i);
      glyph.set([p.shape, p.semiMajor, p.ratio, p.minRadius], 4 * i);
      // Seed: a fixed pseudo-random offset, so that two nebulae do not share the same outline.
      info.set([p.rank, objects[i]!.messier ? 1 : 0, i, (i * 0.618034) % 1], 4 * i);
    }
    geo.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 3));
    geo.setAttribute("aAxis", new THREE.InstancedBufferAttribute(axis, 3));
    geo.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(glyph, 4));
    geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    geo.instanceCount = n;
    return geo;
  }
}
