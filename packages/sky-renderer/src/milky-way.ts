/**
 * The Milky Way on the sky map (#162): the "milkyWay" layer.
 *
 * Data: out/milkyway.webp of packages/sky-data/build_milkyway.py, the density of the Tycho-2
 * stars of magnitude 9 to 11 (AT-HYG v3.2, CC BY-SA 4.0), smoothed on the sphere and log-scaled,
 * 0 away from the band. Equirectangular in J2000 equatorial coordinates: u = RA / 360° (RA
 * increasing with u), v = (90° − Dec) / 180° (north at the top, first row of the image).
 *
 * Rendering: one full-screen pass under everything else (renderOrder MILKY_WAY_ORDER). Each pixel
 * is sent back through the map's own projection (inverse stereographic → view → horizontal, the
 * ground pass's inverse) and then to J2000 with the transpose of uEq2Hor, the matrix that places
 * the stars: the band follows the projection, zoom, pan, roll, date and place exactly as the
 * stars do. Style (ART_DIRECTION §3, « Voie lactée rendue en tramage stochastique / grain »): a
 * faint wash of ink plus dots of a fixed grain in CSS pixels, both in the theme ink (red in night
 * mode), sparse enough to leave the stars and lines on top readable. Like the stars it stays drawn by
 * day (#106) and is dimmed below the horizon with the see-through ground (#65).
 *
 * Cost: one texture fetch, an atan and an asin per pixel; an R8 texture of 1024×512 (512 KiB on
 * the GPU) loaded on demand the first time the layer is on; no allocation per frame. Without the
 * file (pipeline not run, offline before the first copy) the layer draws nothing.
 */
import * as THREE from "three";
import type { Vec3 } from "@asteria/astro-core";
import { loadGreyTexture } from "./grey-texture";
import { projection } from "./shaders";

/** Look of the band (see milkyWayFrag). */
export const MILKY_WAY_STYLE = {
  /** Texture value under which nothing is drawn: the faint wings of the star counts. */
  LOW: 0.28,
  /** Opacity of the soft wash at the densest texel. */
  GLOW: 0.16,
  /** Share of the grain cells inked at the densest texel. */
  GRAIN: 0.22,
  /** Opacity of a grain dot. */
  DOT_ALPHA: 0.32,
  /** Fields (degrees) between which the band fades out when zooming in (its detail is ~1°). */
  FADE_FOV: [4, 12] as const,
  /** Opacity kept in the narrowest fields. */
  MIN_OPACITY: 0.35,
} as const;

/** Under the see-through ground's night background (−1) and everything else. */
export const MILKY_WAY_ORDER = -0.75;

const TAU = 2 * Math.PI;

/**
 * Texture coordinates of a J2000 unit vector (top-left origin): the CPU twin of milkyWayFrag.
 * u ∈ [0, 1) wraps with the right ascension, v ∈ [0, 1] from the north pole.
 */
export function milkyWayUv(dir: Readonly<Vec3>): [number, number] {
  const ra = Math.atan2(dir[1], dir[0]) / TAU;
  const dec = Math.asin(Math.min(1, Math.max(-1, dir[2])));
  return [ra - Math.floor(ra), 0.5 - dec / Math.PI];
}

/** Opacity factor of the band for a field of view (degrees): fades in the narrowest fields. */
export function milkyWayOpacity(fov: number): number {
  const [a, b] = MILKY_WAY_STYLE.FADE_FOV;
  const t = Math.min(1, Math.max(0, (fov - a) / (b - a)));
  const s = t * t * (3 - 2 * t);
  return MILKY_WAY_STYLE.MIN_OPACITY + (1 - MILKY_WAY_STYLE.MIN_OPACITY) * s;
}

const f = (x: number) => x.toFixed(4);
const S = MILKY_WAY_STYLE;

export const milkyWayVert = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Inverse projection as groundFrag, then horizontal → J2000 with uEq2Hor's transpose
 * (h * M = Mᵀ h in GLSL), then milkyWayUv. Above MILKY_WAY_STYLE.LOW the texture value sets a
 * faint wash (GLOW) and the share of grain cells inked (GRAIN, a fixed hash of the CSS pixel), so
 * the dots densify towards the core of the band like the stipple of an engraving.
 */
export const milkyWayFrag = /* glsl */ `
  precision highp float;
  precision highp int;
  ${projection}
  uniform mat3 uViewInv;
  uniform float uDpr;
  uniform vec3 uInk;
  uniform sampler2D uMilkyWay;
  uniform float uMwOpacity;
  varying vec2 vNdc;

  const float TAU = 6.28318531;
  const float PI = 3.14159265;

  // Integer hash of a CSS pixel (lowbias32, C. Wellons): white noise without the streaks of
  // float hashes on integer inputs, exact on every GPU (32-bit integers in GLSL ES 3.00).
  float grain(vec2 cell) {
    uvec2 q = uvec2(ivec2(cell) + 32768);
    uint h = q.x * 0x9E3779B9u ^ q.y * 0x85EBCA6Bu;
    h ^= h >> 16; h *= 0x7FEB352Du;
    h ^= h >> 15; h *= 0x846CA68Bu;
    h ^= h >> 16;
    return float(h >> 8) / 16777216.0;
  }

  void main() {
    vec2 p = vec2(vNdc.x * uAspect, vNdc.y) / uScale;
    float r2 = dot(p, p);
    vec3 v = vec3(4.0 * p, 4.0 - r2) / (4.0 + r2);
    if (v.z < uBackZ) discard;
    vec3 h = uViewInv * v;
    float fade = horizonFade(h.z);
    if (fade <= 0.0) discard;
    vec3 e = h * uEq2Hor;
    vec2 uv = vec2(fract(atan(e.y, e.x) / TAU), 0.5 - asin(clamp(e.z, -1.0, 1.0)) / PI);
    float t = smoothstep(${f(S.LOW)}, 1.0, texture2D(uMilkyWay, uv).r);
    float dot = step(grain(floor(gl_FragCoord.xy / uDpr)) + 0.002, t * ${f(S.GRAIN)});
    float a = (t * ${f(S.GLOW)} + dot * ${f(S.DOT_ALPHA)}) * uMwOpacity * fade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

export interface MilkyWayLayerOptions {
  /** Shared uniforms of the map (projection, ink, horizon, pixel ratio). */
  uniforms: Record<string, THREE.IUniform>;
  /** URL of the texture (milkyway.webp). Absent: layer unavailable. */
  url?: string | undefined;
  /** Asks the map for a frame (texture ready). */
  requestFrame: () => void;
}

/** The Milky Way layer of the sky map: add `mesh` to the scene, drive it with the setters. */
export class MilkyWayLayer {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private enabled = false;
  private state: "idle" | "loading" | "ready" | "failed" = "idle";
  private disposed = false;
  private readonly opacity = { value: 1 };

  constructor(private readonly options: MilkyWayLayerOptions) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...options.uniforms, uMilkyWay: { value: null }, uMwOpacity: this.opacity },
      vertexShader: milkyWayVert,
      fragmentShader: milkyWayFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = MILKY_WAY_ORDER;
    this.mesh.visible = false;
  }

  /** Switches the layer; the first time, loads the texture (failure: nothing is drawn). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on && this.state === "ready";
    if (on && this.state === "idle") void this.load();
  }

  /** Per-frame update (one uniform, allocation-free). */
  update(fov: number): void {
    this.opacity.value = milkyWayOpacity(fov);
  }

  /** Stops a pending load; GPU resources are freed with the scene (disposeObjects). */
  dispose(): void {
    this.disposed = true;
  }

  private async load(): Promise<void> {
    this.state = "loading";
    try {
      const { url } = this.options;
      if (!url) throw new Error("no Milky Way texture configured");
      const texture = await loadGreyTexture(url, {
        mipmaps: false,
        wrapS: THREE.RepeatWrapping,
      });
      if (this.disposed) {
        texture.dispose();
        return;
      }
      this.mesh.material.uniforms.uMilkyWay!.value = texture;
      this.state = "ready";
      this.mesh.visible = this.enabled;
      this.options.requestFrame();
    } catch (e) {
      this.state = "failed";
      console.warn("Milky Way unavailable:", e);
    }
  }
}
