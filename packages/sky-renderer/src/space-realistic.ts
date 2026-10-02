import * as THREE from "three";
import { PLANETS, type Planet, type Vec3 } from "@asteria/astro-core";
import { bvToRgb } from "./space-style";
import {
  atmosphereFrag,
  atmosphereVert,
  realBodyFrag,
  realBodyVert,
  realGlobeFrag,
  realStarFrag,
  realStarVert,
  realSunFrag,
  realSunVert,
} from "./space-real-shaders";
import type { CatalogStar } from "./sky-map";

/** Textures of the realistic style, loaded on demand (see packages/sky-data/build_space.py). */
export type SpaceTextureName = "earth-day" | "moon" | "planets";

/** Uniforms shared with the engraved view (same objects: updated in one place). */
export interface SharedUniforms {
  uPrec: { value: THREE.Matrix3 };
  uDpr: { value: number };
  uSunEarth: { value: THREE.Vector3 };
  uLights: { value: THREE.Texture };
  uRelief: { value: THREE.Texture };
}

/** Sprite sizes (CSS px). Real apparent sizes are far below a pixel: they are exaggerated. */
const MOON_SIZE = 30;
const MOON_SELECTED = 84;
const PLANET_SELECTED = 60;
const SUN_SIZE = 150;
const SUN_DISC = 0.16; // of the sprite's half-size: ≈ 24 CSS px wide
const ATMOSPHERE = 1.035;
const SATURN_SPRITE = 2.4 / 1.6; // ring room (realBodyFrag RING_SPRITE / default sprite radius)

/** Disc diameter (CSS px) of a planet by magnitude, as on the engraved view. */
export function planetDiscSize(magnitude: number): number {
  return Math.min(12, Math.max(5, 7.5 - magnitude * 1.1));
}

/**
 * The realistic style of the space view: its own stars, Sun, Moon and planet sprites, the
 * atmosphere shell and the colour globe material. Built lazily, the first time it is shown.
 * Body directions, sunlight and axes are given in the world frame (equator of date).
 */
export class RealisticLayer {
  readonly globeMaterial: THREE.ShaderMaterial;
  readonly objects: THREE.Object3D[];
  private readonly uniforms;
  private readonly stars: THREE.Points;
  private readonly sun: THREE.Points;
  private readonly bodies: THREE.Points;
  private readonly atmosphere: THREE.Mesh;
  private readonly sizes = new Float32Array(1 + PLANETS.length);
  private readonly magnitudes = new Float32Array(1 + PLANETS.length).fill(99);
  private selected = -1;
  private planetsShown = true;
  private hasSun = false;

  constructor(shared: SharedUniforms, stars: CatalogStar[], starDirs: Vec3[]) {
    const placeholder = new THREE.Texture();
    this.uniforms = {
      ...shared,
      uLimitMag: { value: 5.6 },
      uMono: { value: 0 },
      uMonoInk: { value: new THREE.Color(1, 0, 0) },
      uDay: { value: placeholder },
      uHasDay: { value: 0 },
      uMoonTex: { value: placeholder },
      uHasMoon: { value: 0 },
      uAtlas: { value: placeholder },
      uHasAtlas: { value: 0 },
      uCamEarth: { value: new THREE.Vector3() },
      uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
      uSunSize: { value: SUN_SIZE },
      uSunDisc: { value: SUN_DISC },
      uAtmosphere: { value: ATMOSPHERE },
    };

    // Stars, coloured by B−V
    const g = new THREE.BufferGeometry();
    const flat = starDirs.flat();
    g.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
    g.setAttribute("aDir", new THREE.Float32BufferAttribute(flat, 3));
    g.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(
        Float32Array.from(stars, (s) => s.v),
        1,
      ),
    );
    g.setAttribute(
      "aColor",
      new THREE.Float32BufferAttribute(
        stars.flatMap((s) => bvToRgb(s.bv)),
        3,
      ),
    );
    this.stars = new THREE.Points(g, this.material(realStarVert, realStarFrag, "add"));

    // Sun
    const sunGeo = new THREE.BufferGeometry();
    const sunDir = new THREE.Float32BufferAttribute(new Float32Array(3), 3);
    sunGeo.setAttribute("position", sunDir);
    sunGeo.setAttribute("aDir", sunDir);
    this.sun = new THREE.Points(sunGeo, this.material(realSunVert, realSunFrag, "add"));

    // Moon (index 0) and planets (1 … 7, PLANETS order)
    const n = 1 + PLANETS.length;
    const bodyGeo = new THREE.BufferGeometry();
    const dir = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3);
    bodyGeo.setAttribute("position", dir);
    bodyGeo.setAttribute("aDir", dir);
    for (const name of ["aLight", "aPole", "aPrime"])
      bodyGeo.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    bodyGeo.setAttribute(
      "aKind",
      new THREE.Float32BufferAttribute(
        Float32Array.from({ length: n }, (_, i) => i),
        1,
      ),
    );
    bodyGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    bodyGeo.setAttribute("aGlow", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    this.bodies = new THREE.Points(bodyGeo, this.material(realBodyVert, realBodyFrag, "normal"));

    // Atmosphere shell (world frame; a sphere, so the Earth's rotation does not matter)
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(ATMOSPHERE, 96, 48),
      this.material(atmosphereVert, atmosphereFrag, "add"),
    );
    (this.atmosphere.material as THREE.ShaderMaterial).side = THREE.BackSide;

    this.globeMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vEarth;
        void main() {
          vEarth = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: realGlobeFrag,
    });

    // Drawn after the globe (depth test hides what is behind it); bodies over the Sun's glow.
    this.stars.renderOrder = 1;
    this.sun.renderOrder = 2;
    this.bodies.renderOrder = 3;
    this.atmosphere.renderOrder = 4;
    this.objects = [this.stars, this.sun, this.bodies, this.atmosphere];
    for (const o of this.objects) {
      o.frustumCulled = false;
      o.visible = false;
    }
  }

  setVisible(visible: boolean): void {
    this.stars.visible = visible;
    this.atmosphere.visible = visible;
    this.sun.visible = visible && this.hasSun;
    this.bodies.visible = visible;
  }

  /** Red night vision: the whole realistic rendering in shades of `ink`. */
  setMonochrome(on: boolean, ink: string): void {
    this.uniforms.uMono.value = on ? 1 : 0;
    this.uniforms.uMonoInk.value.set(ink);
  }

  setTexture(name: SpaceTextureName, image: HTMLImageElement | ImageBitmap): void {
    const t = new THREE.Texture(image);
    t.colorSpace = THREE.NoColorSpace; // decoded in the shader (toLinear)
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    const u = this.uniforms;
    if (name === "earth-day") [u.uDay.value, u.uHasDay.value] = [t, 1];
    else if (name === "moon") [u.uMoonTex.value, u.uHasMoon.value] = [t, 1];
    else [u.uAtlas.value, u.uHasAtlas.value] = [t, 1];
  }

  /**
   * After a WebGL context loss: uploads the loaded textures again. three.js already re-creates
   * its GL objects on restore; flagging them makes the re-upload explicit and independent of its
   * internals. The images stay referenced by the textures, so nothing is fetched again.
   */
  refreshTextures(): void {
    const u = this.uniforms;
    for (const t of [u.uDay.value, u.uMoonTex.value, u.uAtlas.value])
      if (t instanceof THREE.Texture && t.image) t.needsUpdate = true;
  }

  /** Sun direction (world), or null when unknown. */
  setSun(dir: THREE.Vector3 | null): void {
    this.hasSun = !!dir;
    if (dir) {
      const a = this.sun.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      a.setXYZ(0, dir.x, dir.y, dir.z);
      a.needsUpdate = true;
      this.uniforms.uSunWorld.value.copy(dir);
    }
  }

  /**
   * One body (0 = Moon, 1 … 7 = PLANETS order + 1): direction, sunward direction, pole and prime
   * meridian (world frame); magnitude for planets (> 50 or null hides it).
   */
  setBody(
    index: number,
    dir: THREE.Vector3 | null,
    sunward: THREE.Vector3,
    pole: THREE.Vector3,
    prime: THREE.Vector3,
    magnitude: number,
  ): void {
    const g = this.bodies.geometry;
    const set = (name: string, v: THREE.Vector3) =>
      (g.getAttribute(name) as THREE.BufferAttribute).setXYZ(index, v.x, v.y, v.z);
    this.magnitudes[index] = dir ? magnitude : 99;
    if (dir) {
      set("aDir", dir);
      set("aLight", sunward);
      set("aPole", pole);
      set("aPrime", prime);
    }
    for (const name of ["aDir", "aLight", "aPole", "aPrime"])
      (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    this.updateSizes();
  }

  /** The Moon (0) or a planet (1 … 7) is drawn enlarged while selected; −1: none. */
  setSelected(index: number): void {
    if (index === this.selected) return;
    this.selected = index;
    this.updateSizes();
  }

  setPlanetsShown(shown: boolean): void {
    if (shown === this.planetsShown) return;
    this.planetsShown = shown;
    this.updateSizes();
  }

  /** Sprite size (CSS px) of body `index`: for picking. 0 when hidden. */
  spriteSize(index: number): number {
    return this.sizes[index]!;
  }

  /** Per frame: the camera position in the Earth-fixed frame (ocean glint, limb). */
  setCameraEarth(camera: THREE.Vector3, earthRotation: number): void {
    this.uniforms.uCamEarth.value.copy(camera).applyAxisAngle(Z_AXIS, -earthRotation);
  }

  private updateSizes(): void {
    const g = this.bodies.geometry;
    const size = g.getAttribute("aSize") as THREE.BufferAttribute;
    const glow = g.getAttribute("aGlow") as THREE.BufferAttribute;
    for (let i = 0; i < this.sizes.length; i++) {
      const mag = this.magnitudes[i]!;
      let s = 0;
      let k = 0;
      if (mag < 50 && (i === 0 || this.planetsShown)) {
        if (i === 0) s = this.selected === 0 ? MOON_SELECTED : MOON_SIZE;
        else {
          const selected = this.selected === i;
          // The sprite holds the disc plus its halo (1.6 radii), Saturn its rings (2.4 radii).
          s = (selected ? PLANET_SELECTED : planetDiscSize(mag)) * 1.6;
          if (PLANETS[i - 1] === ("Saturn" satisfies Planet)) s *= SATURN_SPRITE;
          k = selected ? 0.15 : Math.min(0.9, Math.max(0.25, 0.45 - mag * 0.12));
        }
      }
      this.sizes[i] = s;
      size.setX(i, s);
      glow.setX(i, k);
    }
    size.needsUpdate = true;
    glow.needsUpdate = true;
  }

  private material(vertexShader: string, fragmentShader: string, blend: "add" | "normal") {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: blend === "add" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
