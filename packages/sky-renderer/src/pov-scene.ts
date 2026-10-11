/**
 * Anchors of the Earth view's points of view (#128, #131), drawn in the engraved ink.
 *
 * - La Terre tourne: an arrow round the axis above the North Pole (the Earth's rotation). The
 *   Sun's glyph is drawn on the overlay by the view, on the side its light comes from.
 * - The true-scale solar system (#131), shared by « Les saisons » and « Le système solaire »:
 *   the Sun as a globe of its true radius (engraved: limb-darkened Bayer dither), the Moon and
 *   the planets as globes of their true radii at their true places, and their orbits (osculating
 *   ellipses at the date, orbits.ts) in the ink. The Earth's own globe is the view's.
 * - Les saisons adds the lines of the solstices and of the equinoxes through the Sun, and the
 *   Earth's positions at those instants (anchors.marks, drawn on the overlay with their dates).
 *
 * Every object lives in the world frame of the Earth view (equator of date, Earth radii, the
 * Earth's centre at the origin). Precision (#131): positions reach 700 000 Earth radii
 * (Neptune), beyond what a float32 vertex can hold to a fraction of a planet's radius. So no
 * vertex is far from its own object's origin: the globes are unit spheres scaled and moved, each
 * orbit is written relative to its body and placed on it, and three.js composes each object's
 * model-view matrix in double precision on the CPU before the GPU sees it (relative to the eye).
 *
 * Date-dependent work runs in update(), once per date change: ≈ 30 calls to astronomy-engine
 * (which allocates), and the orbit buffers rewritten in place; nothing else allocates.
 */
import * as THREE from "three";
import {
  ORBITING_BODIES,
  PLANETS,
  SEASON_KINDS,
  geocentricPosition,
  heliocentricPosition,
  seasons,
  type GeocentricPosition,
  type HeliocentricPosition,
  type OrbitingBody,
  type SeasonKind,
} from "@asteria/astro-core";
import { BodyGlobe, type EngravedUniforms, type SurfaceUniforms } from "./body-globe";
import { BODY_TARGETS, EARTH_RADIUS_KM, bodyPole, worldPosition } from "./body-frame";
import { dither } from "./shaders";
import { planetAxes } from "./space-style";
import { AU, SCENE_BODIES, trueRadius, type SceneBody } from "./points-of-view";
import {
  GM_EARTH_MOON_KM3_S2,
  GM_SUN_AU3_D2,
  ORBIT_POINTS,
  SUN_MASS_RATIO,
  ellipse,
  osculate,
  sampleOrbit,
} from "./orbits";
import type { ReferenceFrameId } from "./reference-frames";

/** Rotation arrow of « La Terre tourne »: a circle round the axis above the North Pole. */
export const SPIN_ARROW = Object.freeze({ height: 1.2, radius: 0.62 });
/** Index of each body in SCENE_BODIES (anchors.positions, anchors.radii). */
export const SCENE_INDEX = Object.freeze(
  Object.fromEntries(SCENE_BODIES.map((b, i) => [b, i])) as Record<SceneBody, number>,
);
/** Half-step of the finite differences giving the velocities: planets (days), Moon (s). */
const PLANET_STEP_D = 0.05;
const MOON_STEP_S = 600;
const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;
/** Dashes of the solstice and equinox lines, in au (≈ 3 px when 1 au ≈ 160 px). */
const SEASON_DASH = 0.02 * AU;
/** Opacity of the other orbits in « Les saisons » relative to the solar system. */
const SEASONS_OTHER_ORBITS = 0.35;

/** Weight of each point of view (1 = shown, 0 = hidden), blended during a transition. */
export type PovWeights = Record<ReferenceFrameId, number>;

/** What the view knows at a date (world frame of date). */
export interface PovState {
  date: Date;
  /** Precession J2000 → equator of date. */
  prec: THREE.Matrix3;
}

const sunVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vN = normalize(mat3(modelMatrix) * position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Direction from the surface to the eye, world axes (the view matrix is a rotation).
    vView = -(transpose(mat3(viewMatrix)) * mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * The Sun's globe: limb darkening (μ = cos of the angle to the line of sight, Eddington-like
 * 1 − 0.6 (1 − μ)), dithered in the ink (engraving) or a warm white (realistic, or the night
 * ink in red night vision).
 */
const sunFrag = /* glsl */ `
  precision highp float;
  ${dither}
  uniform vec3 uInk;
  uniform vec3 uBase;
  uniform float uDpr;
  uniform float uRealistic;
  uniform float uMono;
  uniform vec3 uMonoInk;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float mu = max(dot(normalize(vN), normalize(vView)), 0.0);
    float light = 1.0 - 0.6 * (1.0 - mu);
    if (uRealistic > 0.5) {
      vec3 c = vec3(1.0, 0.95, 0.86) * light;
      if (uMono > 0.5) c = uMonoInk * dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    float on = step(bayer8(gl_FragCoord.xy / uDpr) + 0.001, 0.2 + 0.8 * light);
    gl_FragColor = vec4(mix(uBase, uInk, on), 1.0);
  }
`;

interface Weighted {
  material: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  object: THREE.Object3D;
  /** Visibility (0 … 1) from the weights of the points of view. */
  weight: (w: PovWeights) => number;
  base: number;
}

const scene = (w: PovWeights) => w.ecliptic + w.heliocentric;

export class PovScene {
  /** Added once to the scene. */
  readonly object = new THREE.Group();
  /** World positions read by the view for markers, labels, picking and the overlay. */
  readonly anchors = {
    /** Tip of the rotation arrow of « La Terre tourne ». */
    spinTip: new THREE.Vector3(),
    /** SCENE_BODIES order: true positions (world) and radii (Earth radii). */
    positions: SCENE_BODIES.map(() => new THREE.Vector3()),
    radii: SCENE_BODIES.map((b) => trueRadius(b)),
    /** The Earth at the equinoxes and solstices of the year shown (world). */
    marks: SEASON_KINDS.map((kind) => ({ kind, date: new Date(0), position: new THREE.Vector3() })),
  };
  /** The true-scale scene was computed at least once at a known date. */
  ready = false;

  private readonly weighted: Weighted[] = [];
  // « La Terre tourne »
  private readonly spin: THREE.LineSegments;
  // True-scale scene
  private readonly sun: THREE.Mesh;
  private readonly sunUniforms;
  /** BODY_TARGETS order: the Moon, then the planets. */
  private readonly globes: BodyGlobe[];
  /** ORBITING_BODIES order, then the Moon's. */
  private readonly orbits: THREE.Line[] = [];
  private readonly orbitEllipse = ellipse();
  // « Les saisons »
  private readonly seasons = new THREE.Group();
  private readonly seasonLines: THREE.LineSegments;
  private readonly marksJ2000 = SEASON_KINDS.map(() => new THREE.Vector3());
  private seasonsYear = NaN;
  private readonly tmp = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    prime: new THREE.Vector3(),
    m4: new THREE.Matrix4(),
    earth: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
    helio: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
    before: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
    after: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
    geo: { x: 0, y: 0, z: 0, distanceKm: 0, lightTimeS: 0 } as GeocentricPosition,
    geo2: { x: 0, y: 0, z: 0, distanceKm: 0, lightTimeS: 0 } as GeocentricPosition,
    r: { x: 0, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 0 },
  };
  private readonly precQuat = new THREE.Quaternion();
  private readonly when = { before: new Date(0), after: new Date(0) };

  constructor(engraved: EngravedUniforms) {
    // --- « La Terre tourne »: arrow round the axis above the North Pole, 290° counterclockwise
    // seen from the north (west to east).
    const spin: number[] = [];
    const [cz, r, end] = [SPIN_ARROW.height, SPIN_ARROW.radius, 290 * DEG];
    const at = (a: number) => [r * Math.cos(a), r * Math.sin(a), cz];
    for (let i = 0; i < 48; i++) spin.push(...at((end * i) / 48), ...at((end * (i + 1)) / 48));
    const tip = at(end);
    this.anchors.spinTip.set(tip[0]!, tip[1]!, tip[2]!);
    const tangent = [-Math.sin(end), Math.cos(end), 0];
    const radial = [Math.cos(end), Math.sin(end), 0];
    for (const side of [1, -1]) {
      spin.push(...tip);
      spin.push(
        tip[0]! - 0.2 * tangent[0]! + side * 0.11 * radial[0]!,
        tip[1]! - 0.2 * tangent[1]! + side * 0.11 * radial[1]!,
        cz,
      );
    }
    const spinGeometry = new THREE.BufferGeometry();
    spinGeometry.setAttribute("position", new THREE.Float32BufferAttribute(spin, 3));
    this.spin = new THREE.LineSegments(spinGeometry, this.material(0.9, false));
    this.register(this.spin, (w) => w.stars);
    this.object.add(this.spin);

    // --- The Sun at its true radius
    this.sunUniforms = {
      ...engraved,
      uRealistic: { value: 0 },
      uMono: { value: 0 },
      uMonoInk: { value: new THREE.Color() },
    };
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: this.sunUniforms,
        vertexShader: sunVert,
        fragmentShader: sunFrag,
      }),
    );
    this.sun.scale.setScalar(trueRadius("Sun"));
    this.sun.frustumCulled = false;
    this.object.add(this.sun);

    // --- The Moon and the planets at their true radii
    this.globes = BODY_TARGETS.map((body) => {
      const globe = new BodyGlobe(engraved, 64);
      globe.setBody(body);
      this.object.add(globe.object);
      return globe;
    });

    // --- Orbits: each line relative to its body, placed on it (see the header)
    const orbitOf = (opacity: number, weight: (w: PovWeights) => number) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(3 * ORBIT_POINTS), 3),
        ),
        this.material(opacity, false),
      );
      this.register(line, weight);
      this.orbits.push(line);
      this.object.add(line);
    };
    const others = (w: PovWeights) => w.heliocentric + SEASONS_OTHER_ORBITS * w.ecliptic;
    for (const body of ORBITING_BODIES)
      orbitOf(body === "Earth" ? 0.8 : 0.5, body === "Earth" ? scene : others);
    orbitOf(0.45, others); // the Moon's, round the Earth

    // --- « Les saisons »: solstice and equinox lines through the Sun (J2000, Sun-centred)
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.seasonLines = new THREE.LineSegments(g, this.material(0.55, true));
    this.register(this.seasonLines, (w) => w.ecliptic);
    this.seasons.add(this.seasonLines);
    this.object.add(this.seasons);
    this.setWeights({ stars: 0, ecliptic: 0, heliocentric: 0, body: 0 });
  }

  /** Realistic surfaces for the globes (and the realistic Sun's night ink). */
  useRealistic(surfaces: SurfaceUniforms): void {
    for (const g of this.globes) g.useRealistic(surfaces);
    this.sunUniforms.uMono = surfaces.uMono;
    this.sunUniforms.uMonoInk = surfaces.uMonoInk;
    (this.sun.material as THREE.ShaderMaterial).uniforms = this.sunUniforms;
  }

  setRealistic(on: boolean): void {
    for (const g of this.globes) g.setRealistic(on);
    this.sunUniforms.uRealistic.value = on ? 1 : 0;
  }

  /** Date-dependent positions, globes and orbits of the true-scale scene. */
  update({ date, prec }: PovState): void {
    const t = this.tmp;
    const a = this.anchors;
    const q = this.precOf(prec);
    const earth = heliocentricPosition("Earth", date, t.earth);
    const sun = a.positions[SCENE_INDEX.Sun]!.set(-earth.x, -earth.y, -earth.z);
    sun.multiplyScalar(AU).applyQuaternion(q);
    this.sun.position.copy(sun);
    a.positions[SCENE_INDEX.Earth]!.set(0, 0, 0);
    for (const planet of PLANETS) {
      const h = heliocentricPosition(planet, date, t.helio);
      a.positions[SCENE_INDEX[planet]]!.set(h.x - earth.x, h.y - earth.y, h.z - earth.z)
        .multiplyScalar(AU)
        .applyQuaternion(q);
    }
    worldPosition("Moon", date, prec, a.positions[SCENE_INDEX.Moon]!);
    // Globes: placed, lit from the Sun, their axes as the sprites'.
    for (let k = 0; k < BODY_TARGETS.length; k++) {
      const body = BODY_TARGETS[k]!;
      const centre = a.positions[SCENE_INDEX[body]]!;
      const sunward = t.a.copy(sun).sub(centre).normalize();
      bodyPole(body, prec, t.pole);
      if (body === "Moon") {
        // Near side towards the Earth: the prime meridian at the sub-Earth point.
        t.prime.copy(centre).negate().normalize();
        t.prime.addScaledVector(t.pole, -t.prime.dot(t.pole)).normalize();
      } else {
        const [x, y, z] = planetAxes(body, date).prime;
        t.prime.set(x, y, z).applyMatrix3(prec).normalize();
      }
      this.globes[k]!.setPose(centre, sunward, t.pole, t.prime);
    }
    this.updateOrbits(date, q);
    this.updateSeasons(date, q);
    this.ready = true;
  }

  /** Opacities and visibility from the points of view's weights. */
  setWeights(w: PovWeights): void {
    for (const { material, object, weight, base } of this.weighted) {
      const k = Math.min(1, weight(w));
      material.opacity = base * k;
      object.visible = k > 0 && (object === this.spin || this.ready);
    }
    const shown = this.ready && scene(w) >= 0.5;
    this.sun.visible = shown;
    for (const g of this.globes) g.setVisible(shown);
  }

  /** The true-scale scene's globes are drawn (for picking, labels and the clipping planes). */
  sceneShown(): boolean {
    return this.sun.visible;
  }

  /** Per frame: the side of Saturn's ring plane the camera is on. */
  setCamera(camera: THREE.Vector3): void {
    for (const g of this.globes) if (g.object.visible) g.setCamera(camera);
  }

  dispose(): void {
    for (const g of this.globes) g.dispose();
  }

  // --- orbits

  /**
   * Osculating ellipses at `date` (orbits.ts) through the bodies' true positions: the planets'
   * round the Sun (heliocentric J2000, au, velocity by a central difference of ±PLANET_STEP_D),
   * the Moon's round the Earth (geocentric J2000, km). Each line is placed on its body.
   */
  private updateOrbits(date: Date, q: THREE.Quaternion): void {
    const t = this.tmp;
    const time = date.getTime();
    const { before, after } = this.when;
    before.setTime(time - PLANET_STEP_D * DAY_MS);
    after.setTime(time + PLANET_STEP_D * DAY_MS);
    for (let k = 0; k < ORBITING_BODIES.length; k++) {
      const body: OrbitingBody = ORBITING_BODIES[k]!;
      const h = heliocentricPosition(body, date, t.helio);
      const b = heliocentricPosition(body, before, t.before);
      const f = heliocentricPosition(body, after, t.after);
      t.r.x = h.x;
      t.r.y = h.y;
      t.r.z = h.z;
      t.v.x = (f.x - b.x) / (2 * PLANET_STEP_D);
      t.v.y = (f.y - b.y) / (2 * PLANET_STEP_D);
      t.v.z = (f.z - b.z) / (2 * PLANET_STEP_D);
      const mu = GM_SUN_AU3_D2 * (1 + 1 / SUN_MASS_RATIO[body]!);
      this.placeOrbit(this.orbits[k]!, mu, AU, SCENE_INDEX[body], q);
    }
    before.setTime(time - MOON_STEP_S * 1000);
    after.setTime(time + MOON_STEP_S * 1000);
    const m = geocentricPosition("Moon", date, t.geo);
    t.r.x = m.x;
    t.r.y = m.y;
    t.r.z = m.z;
    const mb = geocentricPosition("Moon", before, t.geo);
    const mf = geocentricPosition("Moon", after, t.geo2);
    t.v.x = (mf.x - mb.x) / (2 * MOON_STEP_S);
    t.v.y = (mf.y - mb.y) / (2 * MOON_STEP_S);
    t.v.z = (mf.z - mb.z) / (2 * MOON_STEP_S);
    this.placeOrbit(
      this.orbits[ORBITING_BODIES.length]!,
      GM_EARTH_MOON_KM3_S2,
      1 / EARTH_RADIUS_KM,
      SCENE_INDEX.Moon,
      q,
    );
  }

  /** One orbit from tmp.r, tmp.v: sampled relative to its body, on the body, J2000 → date. */
  private placeOrbit(
    line: THREE.Line,
    mu: number,
    scale: number,
    index: number,
    q: THREE.Quaternion,
  ): void {
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!osculate(this.tmp.r, this.tmp.v, mu, this.orbitEllipse)) {
      line.geometry.setDrawRange(0, 0);
      return;
    }
    sampleOrbit(this.orbitEllipse, scale, pos.array as Float32Array);
    pos.needsUpdate = true;
    line.geometry.setDrawRange(0, ORBIT_POINTS);
    line.position.copy(this.anchors.positions[index]!);
    line.quaternion.copy(q);
  }

  // --- « Les saisons »

  /** Season marks of the year shown (world), and the solstice and equinox lines on the Sun. */
  private updateSeasons(date: Date, q: THREE.Quaternion): void {
    const year = date.getUTCFullYear();
    if (year !== this.seasonsYear) this.buildSeasons(year);
    const sun = this.anchors.positions[SCENE_INDEX.Sun]!;
    this.seasons.position.copy(sun);
    this.seasons.quaternion.copy(q);
    for (let i = 0; i < 4; i++)
      this.anchors.marks[i]!.position.copy(this.marksJ2000[i]!).applyQuaternion(q).add(sun);
  }

  /** The Earth at the four instants (J2000, Sun-centred, Earth radii) and the lines. */
  private buildSeasons(year: number): void {
    this.seasonsYear = year;
    const s = seasons(year);
    const { helio } = this.tmp;
    SEASON_KINDS.forEach((kind: SeasonKind, i) => {
      this.anchors.marks[i]!.date = s[kind];
      const h = heliocentricPosition("Earth", s[kind], helio);
      this.marksJ2000[i]!.set(h.x, h.y, h.z).multiplyScalar(AU);
    });
    const lines = this.seasonLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const m = this.marksJ2000;
    for (const [k, i, j] of [
      [0, 0, 2],
      [1, 1, 3],
    ] as const) {
      lines.setXYZ(2 * k, m[i]!.x, m[i]!.y, m[i]!.z);
      lines.setXYZ(2 * k + 1, m[j]!.x, m[j]!.y, m[j]!.z);
    }
    lines.needsUpdate = true;
    this.seasonLines.computeLineDistances();
  }

  // --- helpers

  /** Quaternion of the precession matrix (cached in precQuat). */
  private precOf(prec: THREE.Matrix3): THREE.Quaternion {
    return this.precQuat.setFromRotationMatrix(this.tmp.m4.setFromMatrix3(prec));
  }

  private material(opacity: number, dashed: boolean) {
    const m = dashed
      ? new THREE.LineDashedMaterial({
          transparent: true,
          opacity,
          depthWrite: false,
          dashSize: SEASON_DASH,
          gapSize: 0.75 * SEASON_DASH,
        })
      : new THREE.LineBasicMaterial({ transparent: true, opacity, depthWrite: false });
    m.userData.ink = true; // recoloured by SpaceView.setTheme
    return m;
  }

  private register(object: THREE.Line, weight: (w: PovWeights) => number): void {
    const material = object.material as THREE.LineBasicMaterial;
    this.weighted.push({ material, object, weight, base: material.opacity });
    object.frustumCulled = false;
    object.renderOrder = 1;
  }
}
