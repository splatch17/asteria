/**
 * The Milky Way (#162, #168): the "milkyWay" layer of the sky map and of the space view.
 *
 * Data: out/milkyway.webp of packages/sky-data/build_milkyway.py, the density of the Tycho-2
 * stars of magnitude 9 to 11 (AT-HYG v3.2, CC BY-SA 4.0), smoothed on the sphere and log-scaled,
 * 0 away from the band. Equirectangular in J2000 equatorial coordinates: u = RA / 360° (RA
 * increasing with u), v = (90° − Dec) / 180° (north at the top, first row of the image).
 *
 * Both views sample it per pixel from a J2000 direction (milkyWayDensity), so the band is fixed to
 * the stars whatever the projection, zoom, pan, roll, date or place:
 *  - sky map: one full-screen pass under everything else (renderOrder MILKY_WAY_ORDER); each pixel
 *    goes back through the map's own projection (inverse stereographic → view → horizontal, the
 *    ground pass's inverse), then to J2000 with the transpose of uEq2Hor, the matrix that places
 *    the stars. Look (#168, the owner's choice over the stippled grain of #162): a diffuse,
 *    transparent glow added to the sky, deep indigo in the faint outskirts to violet-blue and a
 *    pale lavender in the densest clouds; a dim glow of the ink in night red. Being added, it
 *    never covers a star or a line. It fades out by day (daylight drowns it) and with the field
 *    narrower than FADE_FOV (its detail is ~1°);
 *  - space view: a sphere at infinity drawn before the stars, its vertices J2000 directions
 *    placed by the same uPrec as the stars (spaceMilkyWayVert). Realistic style: warm-neutral
 *    glow, browner where the counts thin out (dust lanes). Engraving: a parchment-ink wash and
 *    fine hatches along the galactic parallels, fixed to the sky (ART_DIRECTION §3, gravure).
 *
 * Filtering: bilinear with a smoothstep on the texel fraction (one fetch), so the 0.35° texels do
 * not show as diamonds when zoomed in.
 *
 * Cost: one texture fetch, an atan and an asin per pixel; an R8 texture of 1024×512 (512 KiB on
 * the GPU per view) loaded on demand the first time the layer is on; no allocation per frame.
 * Without the file (pipeline not run, offline before the first copy) the layer draws nothing.
 */
import * as THREE from "three";
import type { Mat3, Vec3 } from "@asteria/astro-core";
import { loadGreyTexture } from "./grey-texture";
import { projection } from "./shaders";

/** Look of the band on the sky map (see milkyWayFrag). */
export const MILKY_WAY_STYLE = {
  /** Texture value under which nothing is drawn: the faint wings of the star counts. */
  LOW: 0.2,
  /** Exponent of the glow: > 1 keeps the outskirts faint and diffuse. */
  GAMMA: 1.35,
  /** Opacity of the glow added at the densest texel (night, wide field). */
  STRENGTH: 0.36,
  /** Fields (degrees) between which the band fades out when zooming in. */
  FADE_FOV: [8, 40] as const,
  /** Opacity kept in the narrowest fields. */
  MIN_OPACITY: 0.2,
} as const;

/**
 * Glow palettes (sRGB): faint outskirts, body of the band, densest clouds. `violet` on the night
 * blue of the map; `ink` scales the theme's ink (night red).
 */
export const MILKY_WAY_PALETTE = {
  violet: ["#3a2a9a", "#6656d8", "#b9b0f2"],
  ink: [0.35, 0.6, 0.9],
} as const;

/** Look of the band in the space view (see spaceMilkyWayFrag). */
export const SPACE_MILKY_WAY_STYLE = {
  LOW: 0.2,
  /** Realistic style: additive opacity at the densest texel. */
  REAL_STRENGTH: 0.22,
  /** Realistic style: share of the band's faint outskirts left black. */
  REAL_LOW: 0.15,
  /** Engraving: opacity of the ink wash and of the hatches at the densest texel. */
  WASH: 0.13,
  HATCH: 0.22,
  /** Spacing of the hatches, degrees of galactic latitude. */
  HATCH_DEG: 0.3,
} as const;

/** Under the see-through ground's night background (−1) and everything else (sky map). */
export const MILKY_WAY_ORDER = -0.75;
/** Space view: after the opaque globes, before the stars and lines (renderOrder 1). */
export const SPACE_MILKY_WAY_ORDER = 0.5;

const TAU = 2 * Math.PI;

/**
 * ICRS (J2000) → galactic rotation, rows = galactic x (centre), y (l = 90°), z (north pole)
 * (ESA 1997, The Hipparcos and Tycho Catalogues, vol. 1, §1.5.3), as in build_milkyway.py.
 */
export const J2000_TO_GALACTIC: Mat3 = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
]; // prettier-ignore

/**
 * Texture coordinates of a J2000 unit vector (top-left origin): the CPU twin of milkyWayDensity.
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

/** Strength of the sky map's glow: full at night, gone in full daylight (it drowns first). */
export function milkyWayStrength(fov: number, daylight: number): number {
  const day = Math.min(1, Math.max(0, daylight));
  return MILKY_WAY_STYLE.STRENGTH * milkyWayOpacity(fov) * (1 - day) * (1 - day);
}

const f = (x: number) => x.toFixed(4);

/** Texture sampling shared by both views (uniforms uMilkyWay, uMwSize). */
export const MILKY_WAY_GLSL = /* glsl */ `
  uniform sampler2D uMilkyWay;
  uniform vec2 uMwSize; // texture size, texels
  const float MW_TAU = 6.28318531;
  const float MW_PI = 3.14159265;
  // Density 0…1 at a J2000 direction: bilinear, smoothed across each texel (one fetch).
  float milkyWayDensity(vec3 e) {
    vec2 uv = vec2(fract(atan(e.y, e.x) / MW_TAU), 0.5 - asin(clamp(e.z, -1.0, 1.0)) / MW_PI);
    vec2 x = uv * uMwSize - 0.5;
    vec2 i = floor(x);
    vec2 t = x - i;
    t = t * t * (3.0 - 2.0 * t);
    return texture2D(uMilkyWay, (i + t + 0.5) / uMwSize).r;
  }
`;

export const milkyWayVert = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const S = MILKY_WAY_STYLE;

/**
 * Sky map: inverse projection as groundFrag, then horizontal → J2000 with uEq2Hor's transpose
 * (h * M = Mᵀ h in GLSL), then the density, turned into a glow added to the sky (additive
 * blending: the colour is multiplied by the alpha and added).
 */
export const milkyWayFrag = /* glsl */ `
  precision highp float;
  ${projection}
  ${MILKY_WAY_GLSL}
  uniform mat3 uViewInv;
  uniform float uMwStrength;
  uniform vec3 uMwFaint;
  uniform vec3 uMwBody;
  uniform vec3 uMwCore;
  varying vec2 vNdc;

  void main() {
    vec2 p = vec2(vNdc.x * uAspect, vNdc.y) / uScale;
    float r2 = dot(p, p);
    vec3 v = vec3(4.0 * p, 4.0 - r2) / (4.0 + r2);
    if (v.z < uBackZ) discard;
    vec3 h = uViewInv * v;
    float fade = horizonFade(h.z);
    if (fade <= 0.0) discard;
    vec3 e = h * uEq2Hor;
    float t = smoothstep(${f(S.LOW)}, 1.0, milkyWayDensity(e));
    if (t <= 0.0) discard;
    float s = pow(t, ${f(S.GAMMA)});
    vec3 col = mix(uMwFaint, uMwBody, smoothstep(0.0, 0.55, s));
    col = mix(col, uMwCore, smoothstep(0.5, 1.0, s));
    gl_FragColor = vec4(col, s * uMwStrength * fade);
  }
`;

/** Space view: a sphere of J2000 directions at infinity, placed by uPrec like the stars. */
export const spaceMilkyWayVert = /* glsl */ `
  uniform mat3 uPrec;
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (uPrec * position), 1.0);
    gl_Position = p.xyww;
  }
`;

const G = J2000_TO_GALACTIC;
const SV = SPACE_MILKY_WAY_STYLE;

/**
 * Space view. uMwMode 0: engraving (ink wash + hatches along the galactic parallels, fixed to the
 * sky, faded out where they would be closer than a pixel), 1: realistic (warm glow, browner in
 * the thin parts), 2: realistic in night red (glow of the ink).
 */
export const spaceMilkyWayFrag = /* glsl */ `
  precision highp float;
  ${MILKY_WAY_GLSL}
  uniform vec3 uInk;
  uniform float uMwMode;
  varying vec3 vDir;

  void main() {
    vec3 e = normalize(vDir);
    float t = smoothstep(${f(SV.LOW)}, 1.0, milkyWayDensity(e));
    if (t <= 0.0) discard;
    if (uMwMode > 0.5) {
      // Realistic: the outskirts drop to black; warm white clouds, faintly brown where thinner.
      float r = smoothstep(${f(SV.REAL_LOW)}, 1.0, t);
      vec3 dust = vec3(0.62, 0.54, 0.46);
      vec3 light = vec3(0.96, 0.93, 0.87);
      vec3 col = uMwMode > 1.5 ? uInk : mix(dust, light, smoothstep(0.2, 0.8, r));
      gl_FragColor = vec4(col, pow(r, 1.5) * ${f(SV.REAL_STRENGTH)});
      return;
    }
    float b = degrees(asin(clamp(dot(vec3(${G.slice(6).map(f).join(", ")}), e), -1.0, 1.0)));
    float h = b / ${f(SV.HATCH_DEG)};
    float px = fwidth(h);
    float dist = 0.5 - abs(fract(h) - 0.5); // 0 on a hatch, 0.5 between two
    // Engraved hatches: thicker where the band is denser (up to a third of the spacing).
    float core = smoothstep(0.35, 1.0, t);
    float w = max(0.5 * px, core * 0.16);
    float hatch = (1.0 - smoothstep(w - 0.5 * px, w + 0.5 * px, dist)) * (1.0 - smoothstep(0.15, 0.4, px));
    float a = t * ${f(SV.WASH)} + hatch * core * ${f(SV.HATCH)};
    if (a < 0.003) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

/** Loads the texture into `uniforms` (uMilkyWay, uMwSize) once; null if unavailable. */
export class MilkyWayTexture {
  private state: "idle" | "loading" | "ready" | "failed" = "idle";
  private disposed = false;
  readonly uniforms = {
    uMilkyWay: { value: null as THREE.Texture | null },
    uMwSize: { value: new THREE.Vector2(1, 1) },
  };

  constructor(
    private readonly url: string | undefined,
    private readonly onReady: () => void,
  ) {}

  get ready(): boolean {
    return this.state === "ready";
  }

  /** Starts loading the first time it is called (failure: the layer stays empty). */
  request(): void {
    if (this.state === "idle") void this.load();
  }

  dispose(): void {
    this.disposed = true;
  }

  private async load(): Promise<void> {
    this.state = "loading";
    try {
      if (!this.url) throw new Error("no Milky Way texture configured");
      const texture = await loadGreyTexture(this.url, {
        mipmaps: false,
        wrapS: THREE.RepeatWrapping,
      });
      if (this.disposed) {
        texture.dispose();
        return;
      }
      this.uniforms.uMilkyWay.value = texture;
      const img = texture.image as { width: number; height: number };
      this.uniforms.uMwSize.value.set(img.width, img.height);
      this.state = "ready";
      this.onReady();
    } catch (e) {
      this.state = "failed";
      console.warn("Milky Way unavailable:", e);
    }
  }
}

export interface MilkyWayLayerOptions {
  /** Shared uniforms of the map (projection, ink, horizon, pixel ratio). */
  uniforms: Record<string, THREE.IUniform>;
  /** URL of the texture (milkyway.webp). Absent: layer unavailable. */
  url?: string | undefined;
  /** Asks the map for a frame (texture ready). */
  requestFrame: () => void;
}

/** Glow colours of a theme (sRGB hex), see MILKY_WAY_PALETTE. */
export function milkyWayColors(
  glow: "violet" | "ink",
  ink: string,
): [THREE.Color, THREE.Color, THREE.Color] {
  if (glow === "violet")
    return MILKY_WAY_PALETTE.violet.map((c) => new THREE.Color().setStyle(c)) as [
      THREE.Color,
      THREE.Color,
      THREE.Color,
    ];
  const base = new THREE.Color().setStyle(ink);
  return MILKY_WAY_PALETTE.ink.map((k) => base.clone().multiplyScalar(k)) as [
    THREE.Color,
    THREE.Color,
    THREE.Color,
  ];
}

/** The Milky Way layer of the sky map: add `mesh` to the scene, drive it with the setters. */
export class MilkyWayLayer {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private enabled = false;
  private readonly texture: MilkyWayTexture;
  private readonly strength = { value: 1 };
  private readonly colors = {
    uMwFaint: { value: new THREE.Color() },
    uMwBody: { value: new THREE.Color() },
    uMwCore: { value: new THREE.Color() },
  };

  constructor(options: MilkyWayLayerOptions) {
    this.texture = new MilkyWayTexture(options.url, () => {
      this.mesh.visible = this.enabled;
      options.requestFrame();
    });
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...options.uniforms,
        ...this.texture.uniforms,
        ...this.colors,
        uMwStrength: this.strength,
      },
      vertexShader: milkyWayVert,
      fragmentShader: milkyWayFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = MILKY_WAY_ORDER;
    this.mesh.visible = false;
    this.setGlow("violet", "#f0e6d2");
  }

  /** Switches the layer; the first time, loads the texture (failure: nothing is drawn). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on && this.texture.ready;
    if (on) this.texture.request();
  }

  /** Palette of the glow: violet on the night blue, or the ink (night red). */
  setGlow(glow: "violet" | "ink", ink: string): void {
    const [a, b, c] = milkyWayColors(glow, ink);
    this.colors.uMwFaint.value.copy(a);
    this.colors.uMwBody.value.copy(b);
    this.colors.uMwCore.value.copy(c);
  }

  /** Per-frame update (one uniform, allocation-free). */
  update(fov: number, daylight: number): void {
    this.strength.value = milkyWayStrength(fov, daylight);
  }

  /** Stops a pending load; GPU resources are freed with the scene (disposeObjects). */
  dispose(): void {
    this.texture.dispose();
  }
}

/** Space view's Milky Way: a sphere at infinity; `mesh` goes into the scene. */
export class SpaceMilkyWay {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private enabled = false;
  private readonly texture: MilkyWayTexture;
  private readonly mode = { value: 0 };

  constructor(options: MilkyWayLayerOptions) {
    this.texture = new MilkyWayTexture(options.url, () => {
      this.mesh.visible = this.enabled;
      options.requestFrame();
    });
    const material = new THREE.ShaderMaterial({
      uniforms: { ...options.uniforms, ...this.texture.uniforms, uMwMode: this.mode },
      vertexShader: spaceMilkyWayVert,
      fragmentShader: spaceMilkyWayFrag,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    // 3.75° per segment; directions are exact per pixel (normalised in the fragment shader).
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SPACE_MILKY_WAY_ORDER;
    this.mesh.visible = false;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on && this.texture.ready;
    if (on) this.texture.request();
  }

  /** Engraving (ink wash and hatches), realistic glow, or realistic in night red. */
  setStyle(style: "engraving" | "realistic", monochrome: boolean): void {
    const realistic = style === "realistic";
    this.mode.value = realistic ? (monochrome ? 2 : 1) : 0;
    this.mesh.material.blending = realistic ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mesh.material.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
