/**
 * Globe of the Moon or a planet in the body-centred frame (#123): a sphere at the body's real
 * position and radius (world frame, Earth radii), lit by the Sun, with Saturn's rings.
 *
 * Two looks, as the Earth's globe: the engraving (1-bit Bayer dither of the sunlight, ink on the
 * theme's ground colour, ART_DIRECTION A) and the realistic style (the Moon map and the planet
 * atlas of space-style / RealisticLayer, Lambert light, ring shadows), sharing the realistic
 * layer's texture uniforms once it is built.
 *
 * The geometry is a unit sphere scaled and translated, never rotated: the fragment shaders get
 * the world normal directly; the body axes (pole, prime meridian) are uniforms. three.js computes
 * the model-view matrix in double precision on the CPU, so a planet 700 000 Earth radii away is
 * drawn camera-relative without jitter.
 */
import * as THREE from "three";
import { PLANETS } from "@asteria/astro-core";
import { dither } from "./shaders";
import { bodySurface, finish } from "./space-real-shaders";
import { SATURN_RINGS, bodyRadius, poleUpRotation, type BodyTarget } from "./body-frame";

/** Kind index of the shared surface shader: 0 = Moon, 1 … 7 = PLANETS order + 1. */
export const bodyKind = (body: BodyTarget): number =>
  body === "Moon" ? 0 : 1 + PLANETS.indexOf(body);

const globeVert = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = position; // unit sphere, never rotated: the world normal
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const axes = /* glsl */ `
  uniform vec3 uSun;    // unit vector from the body towards the Sun (world)
  uniform vec3 uPole;   // north pole (world)
  uniform vec3 uPrime;  // prime meridian (world)
  uniform float uKind;
  uniform float uRings; // 1 for Saturn
`;

/** Shadow of Saturn's rings on the globe at the normal n: opacity of the ring crossed. */
const ringShadow = /* glsl */ `
  float ringShadow(vec3 n) {
    float denom = dot(uSun, uPole);
    if (uRings < 0.5 || abs(denom) < 1e-3) return 0.0;
    float s = -dot(n, uPole) / denom;
    return s > 0.0 ? ring(length(n + s * uSun)).a : 0.0;
  }
`;

const realGlobeFrag = /* glsl */ `
  precision highp float;
  ${finish}
  ${bodySurface}
  ${axes}
  ${ringShadow}
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    vec3 east = normalize(cross(uPole, uPrime));
    float lambert = max(dot(n, uSun), 0.0);
    vec3 albedo = toLinear(surfaceAt(n, uPole, uPrime, east, uKind));
    // Gas giants and Venus: softer limb darkening than a Lambert surface (as the sprites).
    float soft = uKind > 3.5 || abs(uKind - 2.0) < 0.5 ? 0.85 : 1.0;
    float light = mix(sqrt(lambert), lambert, soft) * (1.0 - 0.75 * ringShadow(n));
    float earthshine = uKind < 0.5 ? 0.012 : 0.0;
    gl_FragColor = vec4(finish(albedo * (light * 1.25 + earthshine)), 1.0);
  }
`;

const engravedGlobeFrag = /* glsl */ `
  precision highp float;
  ${dither}
  ${bodySurface}
  ${axes}
  ${ringShadow}
  uniform vec3 uInk;
  uniform vec3 uBase;
  uniform float uDpr;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    float lambert = max(dot(n, uSun), 0.0);
    // Ink density: sunlight, a little lighter towards the terminator, shadowed by the rings.
    float ink = pow(lambert, 0.8) * 0.92 * (1.0 - 0.7 * ringShadow(n));
    float on = step(bayer8(gl_FragCoord.xy / uDpr) + 0.001, ink);
    gl_FragColor = vec4(mix(uBase, uInk, on), 1.0);
  }
`;

const ringVert = /* glsl */ `
  uniform float uRadius;
  varying vec3 vW;    // position relative to the centre, world axes, body radii
  varying float vRho; // distance from the centre, body radii
  void main() {
    vRho = length(position.xy);
    vW = mat3(modelMatrix) * position / uRadius;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Lit face seen (1) or light through the rings (0.22); globe's shadow on the rings (0.08). */
const ringLight = /* glsl */ `
  uniform float uCamSide; // side of the ring plane the camera is on (sign along the pole)
  float ringLight(vec3 w) {
    float lit = sign(dot(uPole, uSun)) * uCamSide > 0.0 ? 1.0 : 0.22;
    float b = dot(w, uSun);
    if (b < 0.0 && dot(w, w) - b * b < 1.0) lit *= 0.08;
    return lit;
  }
`;

const realRingFrag = /* glsl */ `
  precision highp float;
  ${finish}
  ${bodySurface}
  ${axes}
  ${ringLight}
  varying vec3 vW;
  varying float vRho;
  void main() {
    vec4 rg = ring(vRho);
    if (rg.a < 0.01) discard;
    gl_FragColor = vec4(finish(toLinear(rg.rgb) * ringLight(vW) * 1.2), rg.a);
  }
`;

const engravedRingFrag = /* glsl */ `
  precision highp float;
  ${dither}
  ${bodySurface}
  ${axes}
  ${ringLight}
  uniform vec3 uInk;
  uniform float uDpr;
  varying vec3 vW;
  varying float vRho;
  void main() {
    float a = ring(vRho).a;
    // Without the atlas: the Cassini division (1.95 … 2.03 radii) as a gap in the dither.
    if (uHasAtlas < 0.5 && vRho > 1.95 && vRho < 2.03) a *= 0.15;
    float ink = a * 0.75 * ringLight(vW);
    if (step(bayer8(gl_FragCoord.xy / uDpr) + 0.001, ink) < 0.5) discard;
    gl_FragColor = vec4(uInk, 1.0);
  }
`;

/** Uniforms of the realistic surfaces (owned by RealisticLayer: textures, night ink). */
export interface SurfaceUniforms {
  uMoonTex: { value: THREE.Texture };
  uHasMoon: { value: number };
  uAtlas: { value: THREE.Texture };
  uHasAtlas: { value: number };
  uMono: { value: number };
  uMonoInk: { value: THREE.Color };
}

/** Uniforms shared with the engraved Earth view (theme colours, pixel ratio). */
export interface EngravedUniforms {
  uInk: { value: THREE.Color };
  uBase: { value: THREE.Color };
  uDpr: { value: number };
}

export class BodyGlobe {
  /** Added to the scene once; hidden when no body is shown. */
  readonly object = new THREE.Group();
  private readonly sphere: THREE.Mesh;
  private readonly rings: THREE.Mesh;
  private readonly local;
  private readonly engraved: { globe: THREE.ShaderMaterial; rings: THREE.ShaderMaterial };
  private realistic: { globe: THREE.ShaderMaterial; rings: THREE.ShaderMaterial } | null = null;
  private realisticOn = false;
  private body: BodyTarget = "Moon";
  private readonly quat = new THREE.Quaternion();

  /** `segments`: longitude segments of the sphere (half as many in latitude). */
  constructor(engraved: EngravedUniforms, segments = 96) {
    const placeholder = new THREE.Texture();
    this.local = {
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uPole: { value: new THREE.Vector3(0, 0, 1) },
      uPrime: { value: new THREE.Vector3(1, 0, 0) },
      uKind: { value: 0 },
      uRings: { value: 0 },
      uRadius: { value: 1 },
      uCamSide: { value: 1 },
      // Engraved materials: no textures (the realistic ones get RealisticLayer's).
      uMoonTex: { value: placeholder },
      uHasMoon: { value: 0 },
      uAtlas: { value: placeholder },
      uHasAtlas: { value: 0 },
    };
    const uniforms = { ...this.local, ...engraved };
    this.engraved = {
      globe: this.globeMaterial(engravedGlobeFrag, uniforms),
      rings: this.ringMaterial(engravedRingFrag, uniforms, false),
    };
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, segments, segments / 2),
      this.engraved.globe,
    );
    this.rings = new THREE.Mesh(
      new THREE.RingGeometry(SATURN_RINGS.inner, SATURN_RINGS.outer, 192, 1),
      this.engraved.rings,
    );
    // The rings are drawn after the stars (renderOrder 1 … 4) so that they veil them.
    this.rings.renderOrder = 5;
    this.object.add(this.sphere, this.rings);
    this.object.visible = false;
    for (const o of [this.sphere, this.rings]) o.frustumCulled = false;
  }

  /** Builds the realistic materials on the realistic layer's surface uniforms (textures). */
  useRealistic(surfaces: SurfaceUniforms): void {
    if (this.realistic) return;
    const uniforms = { ...this.local, ...surfaces };
    this.realistic = {
      globe: this.globeMaterial(realGlobeFrag, uniforms),
      rings: this.ringMaterial(realRingFrag, uniforms, true),
    };
    this.applyStyle();
  }

  setRealistic(on: boolean): void {
    this.realisticOn = on;
    this.applyStyle();
  }

  setBody(body: BodyTarget): void {
    this.body = body;
    this.local.uKind.value = bodyKind(body);
    this.local.uRings.value = body === "Saturn" ? 1 : 0;
    this.rings.visible = body === "Saturn";
  }

  getBody(): BodyTarget {
    return this.body;
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  /**
   * Centre (world, Earth radii), sunward direction, pole and prime meridian (world, unit), and
   * the drawn radius (the body's true radius unless a diagram enlarges it, #128).
   */
  setPose(
    centre: THREE.Vector3,
    sunward: THREE.Vector3,
    pole: THREE.Vector3,
    prime: THREE.Vector3,
    r = bodyRadius(this.body),
  ): void {
    this.object.position.copy(centre);
    this.object.scale.setScalar(r);
    this.local.uRadius.value = r;
    this.local.uSun.value.copy(sunward);
    this.local.uPole.value.copy(pole);
    this.local.uPrime.value.copy(prime);
    // The rings lie in the equator: their local z is the pole.
    this.rings.quaternion.copy(poleUpRotation(pole, this.quat));
  }

  /** Per frame: which side of the ring plane the camera is on. */
  setCamera(camera: THREE.Vector3): void {
    const side = this.object.position;
    const p = this.local.uPole.value;
    const d = (camera.x - side.x) * p.x + (camera.y - side.y) * p.y + (camera.z - side.z) * p.z;
    this.local.uCamSide.value = d >= 0 ? 1 : -1;
  }

  dispose(): void {
    this.sphere.geometry.dispose();
    this.rings.geometry.dispose();
    for (const m of [this.engraved, this.realistic])
      if (m) for (const mat of [m.globe, m.rings]) mat.dispose();
  }

  private applyStyle(): void {
    const set = this.realisticOn && this.realistic ? this.realistic : this.engraved;
    this.sphere.material = set.globe;
    this.rings.material = set.rings;
  }

  private globeMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: globeVert, fragmentShader });
  }

  private ringMaterial(
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform>,
    blend: boolean,
  ) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: ringVert,
      fragmentShader,
      transparent: blend,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
}
