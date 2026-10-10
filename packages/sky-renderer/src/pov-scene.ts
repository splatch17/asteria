/**
 * Anchors of the Earth view's points of view (#128), drawn in the engraved ink: what stays fixed
 * and what moves in each of them (see points-of-view.ts for the scales).
 *
 * - La Terre tourne: an arrow round the axis above the North Pole (the Earth's rotation). The
 *   Sun's light is drawn on the overlay by the view (it comes from beyond the screen).
 * - Vu du sol: the Sun and the Moon on their daily circles round the Earth (schematic radii),
 *   and today's sub-solar and sub-lunar tracks on the globe; under reduced motion, ghosts of
 *   the Sun 3 h and 6 h before and after.
 * - Les saisons: the Sun, the Earth's orbit (true shape, 6 Earth radii per au), the lines of
 *   the solstices and of the equinoxes, and four ghost Earths at those instants, lit by the Sun,
 *   their axes parallel to the Earth's.
 * - Le système solaire: the Sun, the eight orbits (compressed), the planets as small engraved
 *   globes (enlarged), the Earth → Mars line of sight and its trace on a backdrop circle over
 *   the last six months, which turns back round Mars' opposition (retrograde motion).
 *
 * Every object lives in the world frame of the Earth view (equator of date, Earth radii, the
 * Earth's centre at the origin). The diagrams' orbits are built in J2000 axes inside a group
 * placed on the drawn Sun and turned by the precession; the globes are posed in world axes
 * (their shaders take world normals). Date-dependent work runs in update(), once per date
 * change; it calls astronomy-engine, which allocates, but nothing else does per frame.
 */
import * as THREE from "three";
import {
  ORBITAL_PERIOD_DAYS,
  ORBITING_BODIES,
  PLANETS,
  SEASON_KINDS,
  heliocentricPosition,
  meanObliquity,
  seasons,
  type HeliocentricPosition,
  type OrbitingBody,
  type Planet,
  type SeasonKind,
} from "@asteria/astro-core";
import { BodyGlobe, type EngravedUniforms, type SurfaceUniforms } from "./body-globe";
import { bodyPole } from "./body-frame";
import { bodyFrag } from "./shaders";
import { localBodyVert } from "./space-shaders";
import { planetAxes } from "./space-style";
import { SEASONS_SCALE, diagramPoint, lineOfSight, planetDrawRadius } from "./points-of-view";
import type { ReferenceFrameId } from "./reference-frames";

/** Radii of the Sun's and the Moon's daily circles in « Vu du sol », Earth radii (schematic). */
export const GROUND_SUN_RADIUS = 1.9;
export const GROUND_MOON_RADIUS = 1.45;
/** Radius of the backdrop circle of the solar system diagram (beyond Neptune's 32.3). */
export const BACKDROP_RADIUS = 34;
/** Rotation arrow of « La Terre tourne »: a circle round the axis above the North Pole. */
export const SPIN_ARROW = Object.freeze({ height: 1.2, radius: 0.62 });
/** Radius of the ghost Earths of « Les saisons », Earth radii. */
export const GHOST_EARTH_RADIUS = 0.7;
/** Trace of the Earth → Mars line on the backdrop: one point every 4 days over 6 months. */
const TRAIL_STEP_DAYS = 4;
const TRAIL_SAMPLES = 46;
/** Inward drift of the trace per day of age, as a share of the backdrop's radius (8 % in 6 months). */
const TRAIL_SPIRAL = 0.08 / 184;
const DAY_MS = 86_400_000;
const ORBIT_SAMPLES = 256;
/** Hour offsets of the ghost Suns of « Vu du sol » under reduced motion. */
export const GHOST_SUN_HOURS = [-6, -3, 3, 6] as const;
/** Sidereal rotation of the Earth per hour of time, degrees (360.98564736629° a day). */
const EARTH_TURN_PER_HOUR = 360.98564736629 / 24;
const OBLIQUITY_J2000 = meanObliquity(new Date(Date.UTC(2000, 0, 1, 12))) * (Math.PI / 180);
const DEG = Math.PI / 180;

/** Glyph vertices: Sun and Moon of « Vu du sol », 4 ghost Suns, the diagrams' Suns. */
export const GLYPH = { groundSun: 0, groundMoon: 1, ghost: 2, seasonsSun: 6, solarSun: 7 } as const;
const GLYPH_COUNT = 8;
const GLYPH_SIZE = [30, 24, 20, 20, 20, 20, 52, 46];

/** Weight of each point of view (1 = shown, 0 = hidden), blended during a transition. */
export type PovWeights = Record<ReferenceFrameId, number>;

/** What the view knows at a date (world frame of date). */
export interface PovState {
  date: Date;
  /** Precession J2000 → equator of date. */
  prec: THREE.Matrix3;
  /** Unit directions of the Sun and the Moon (of date), null when unknown. */
  sun: THREE.Vector3 | null;
  moon: THREE.Vector3 | null;
}

/** Which anchors to compute: only those of the points of view shown or being left. */
export interface PovNeeds {
  ground: boolean;
  seasons: boolean;
  solar: boolean;
}

interface Weighted {
  material: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  object: THREE.Object3D;
  view: ReferenceFrameId;
  base: number;
}

const unitCircle = (n: number, r = 1): number[] => {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 * Math.PI;
    pts.push(r * Math.cos(t), r * Math.sin(t), 0);
  }
  return pts;
};

export class PovScene {
  /** Added once to the scene. */
  readonly object = new THREE.Group();
  /** World positions read by the view for labels, picking and the overlay. */
  readonly anchors = {
    groundSun: new THREE.Vector3(),
    groundMoon: new THREE.Vector3(),
    subSolar: new THREE.Vector3(),
    subLunar: new THREE.Vector3(),
    /** Tip of the rotation arrow of « La Terre tourne ». */
    spinTip: new THREE.Vector3(),
    seasonsSun: new THREE.Vector3(),
    solarSun: new THREE.Vector3(),
    /** Earth's axis top in « Les saisons » (world). */
    marks: SEASON_KINDS.map((kind) => ({ kind, date: new Date(0), position: new THREE.Vector3() })),
    planets: PLANETS.map(() => new THREE.Vector3()),
    planetRadius: PLANETS.map((p) => planetDrawRadius(p)),
    marsHit: new THREE.Vector3(),
  };
  /** The anchors of each diagram are valid (computed at least once at a known date). */
  readonly ready = { ground: false, seasons: false, solar: false };

  private readonly weighted: Weighted[] = [];
  private readonly glyphs: THREE.Points;
  private readonly glyphFade: THREE.BufferAttribute;
  private readonly glyphPos: THREE.BufferAttribute;
  readonly glyphUniforms: { uSunAngle: { value: number } };
  // « La Terre tourne »
  private readonly spin: THREE.LineSegments;
  // « Vu du sol »
  private readonly sunCircle: THREE.Line;
  private readonly moonCircle: THREE.Line;
  private readonly subSolarTrack: THREE.Line;
  private readonly subLunarTrack: THREE.Line;
  private groundOk = { sun: false, moon: false };
  // « Les saisons »
  private readonly seasons = new THREE.Group();
  private readonly orbit: THREE.Line;
  private readonly seasonLines: THREE.LineSegments;
  private readonly ghosts: BodyGlobe[];
  private readonly ghostAxes: THREE.LineSegments;
  private readonly marksJ2000 = SEASON_KINDS.map(() => new THREE.Vector3());
  private seasonsYear = NaN;
  // « Le système solaire »
  private readonly solar = new THREE.Group();
  private readonly orbits: THREE.LineLoop[] = [];
  private orbitsEpoch = NaN;
  private readonly planetGlobes: BodyGlobe[];
  private readonly marsLine: THREE.Line;
  private readonly trail: THREE.Line;
  private readonly trailIndex = new Float64Array(TRAIL_SAMPLES).fill(NaN);
  private readonly trailHits = new Float32Array(3 * TRAIL_SAMPLES);
  private readonly trailOk = new Uint8Array(TRAIL_SAMPLES);
  private readonly tmp = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    prime: new THREE.Vector3(),
    m4: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    helio: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
    helio2: { x: 0, y: 0, z: 0, distanceAu: 0 } as HeliocentricPosition,
  };
  private readonly precQuat = new THREE.Quaternion();

  constructor(
    engraved: EngravedUniforms,
    shared: { uInk: THREE.IUniform; uDpr: THREE.IUniform; uMoonT: THREE.IUniform },
  ) {
    // --- Glyphs of the Sun and the Moon at finite positions
    const g = new THREE.BufferGeometry();
    this.glyphPos = new THREE.Float32BufferAttribute(new Float32Array(3 * GLYPH_COUNT), 3);
    this.glyphFade = new THREE.Float32BufferAttribute(new Float32Array(GLYPH_COUNT), 1);
    g.setAttribute("position", this.glyphPos);
    g.setAttribute("aKind", new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 0, 0, 0], 1));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(GLYPH_SIZE, 1));
    g.setAttribute("aFade", this.glyphFade);
    this.glyphUniforms = { uSunAngle: { value: 0 } };
    this.glyphs = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, ...this.glyphUniforms },
        vertexShader: localBodyVert,
        fragmentShader: bodyFrag,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      }),
    );
    this.glyphs.frustumCulled = false;
    this.glyphs.renderOrder = 2;

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
    this.spin = this.lines(spin, "stars", 0.9, false);

    // --- « Vu du sol »: daily circles (scaled and raised per date) and surface tracks
    const circle = unitCircle(128);
    this.sunCircle = this.line(circle, "earth", 0.75, true, 0.035, 0.03);
    this.moonCircle = this.line(circle, "earth", 0.5, true, 0.035, 0.03);
    this.subSolarTrack = this.line(circle, "earth", 0.8, true, 0.012, 0.018);
    this.subLunarTrack = this.line(circle, "earth", 0.45, true, 0.012, 0.018);

    // --- « Les saisons »
    this.orbit = this.line(new Array<number>(3 * 366).fill(0), "ecliptic", 0.85, false);
    this.seasonLines = this.lines(new Array<number>(12).fill(0), "ecliptic", 0.55, true);
    this.seasons.add(this.orbit, this.seasonLines); // moved from the root group
    this.ghosts = SEASON_KINDS.map(() => {
      const ghost = new BodyGlobe(engraved, 32);
      ghost.setBody("Mars"); // engraved only: no surface, no rings
      this.object.add(ghost.object);
      return ghost;
    });
    this.ghostAxes = this.lines(new Array<number>(24).fill(0), "ecliptic", 0.85, false);

    // --- « Le système solaire »
    for (const body of ORBITING_BODIES) {
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(new Float32Array(3 * ORBIT_SAMPLES), 3),
        ),
        this.material(body === "Earth" ? 0.8 : 0.45, false),
      );
      this.register(line, "heliocentric");
      this.orbits.push(line);
      this.solar.add(line);
    }
    // Backdrop circle in the J2000 ecliptic plane, where the line of sight meets the "stars".
    const backdrop: number[] = [];
    for (let i = 0; i <= 256; i++) {
      const t = (i / 256) * 2 * Math.PI;
      backdrop.push(
        BACKDROP_RADIUS * Math.cos(t),
        BACKDROP_RADIUS * Math.sin(t) * Math.cos(OBLIQUITY_J2000),
        BACKDROP_RADIUS * Math.sin(t) * Math.sin(OBLIQUITY_J2000),
      );
    }
    const ring = this.line(backdrop, "heliocentric", 0.3, true, 0.5, 0.45);
    this.trail = this.line(
      new Array<number>(3 * (TRAIL_SAMPLES + 1)).fill(0),
      "heliocentric",
      0.9,
      false,
    );
    this.solar.add(ring, this.trail);
    this.marsLine = this.line([0, 0, 0, 0, 0, 0], "heliocentric", 0.7, true, 0.4, 0.3);
    this.planetGlobes = PLANETS.map((planet) => {
      const globe = new BodyGlobe(engraved, 32);
      globe.setBody(planet);
      this.object.add(globe.object);
      return globe;
    });

    this.object.add(this.glyphs, this.seasons, this.solar);
    this.setWeights({ stars: 0, earth: 0, ecliptic: 0, heliocentric: 0, body: 0 }, false);
  }

  /** Realistic surfaces for the planets of the solar system diagram (the ghosts stay engraved). */
  useRealistic(surfaces: SurfaceUniforms): void {
    for (const g of this.planetGlobes) g.useRealistic(surfaces);
  }

  setRealistic(on: boolean): void {
    for (const g of this.planetGlobes) g.setRealistic(on);
  }

  /** Date-dependent anchors of the points of view that are needed. */
  update(state: PovState, needs: PovNeeds): void {
    if (needs.ground) this.updateGround(state);
    if (needs.seasons) this.updateSeasons(state);
    if (needs.solar) this.updateSolar(state);
    this.glyphPos.needsUpdate = true;
  }

  /**
   * Opacities and visibility from the points of view's weights. `reducedMotion`: the ghost Suns
   * of « Vu du sol » stand for the demonstration.
   */
  setWeights(w: PovWeights, reducedMotion: boolean): void {
    for (const { material, object, view, base } of this.weighted) {
      material.opacity = base * w[view];
      object.visible = w[view] > 0;
    }
    const fade = this.glyphFade;
    const ground = this.ready.ground ? w.earth : 0;
    fade.setX(GLYPH.groundSun, this.groundOk.sun ? ground : 0);
    fade.setX(GLYPH.groundMoon, this.groundOk.moon ? ground : 0);
    for (let i = 0; i < 4; i++)
      fade.setX(GLYPH.ghost + i, reducedMotion && this.groundOk.sun ? ground * 0.45 : 0);
    fade.setX(GLYPH.seasonsSun, this.ready.seasons ? w.ecliptic : 0);
    fade.setX(GLYPH.solarSun, this.ready.solar ? w.heliocentric : 0);
    fade.needsUpdate = true;
    this.subSolarTrack.visible &&= this.groundOk.sun;
    this.sunCircle.visible &&= this.groundOk.sun;
    this.subLunarTrack.visible &&= this.groundOk.moon;
    this.moonCircle.visible &&= this.groundOk.moon;
    this.seasons.visible = this.ready.seasons && w.ecliptic > 0;
    this.ghostAxes.visible &&= this.ready.seasons;
    for (const g of this.ghosts) g.setVisible(this.ready.seasons && w.ecliptic >= 0.5);
    this.solar.visible = this.ready.solar && w.heliocentric > 0;
    this.marsLine.visible &&= this.ready.solar;
    for (const g of this.planetGlobes) g.setVisible(this.ready.solar && w.heliocentric >= 0.5);
  }

  /** Per frame: the side of Saturn's ring plane the camera is on. */
  setCamera(camera: THREE.Vector3): void {
    for (const g of this.planetGlobes) if (g.object.visible) g.setCamera(camera);
  }

  /** Planet of the solar system diagram whose globe is drawn (for picking and labels). */
  planetShown(): boolean {
    return this.planetGlobes[0]!.object.visible;
  }

  dispose(): void {
    for (const g of [...this.ghosts, ...this.planetGlobes]) g.dispose();
  }

  // --- « Vu du sol »

  private updateGround({ sun, moon }: PovState): void {
    const a = this.anchors;
    this.groundOk.sun = !!sun;
    this.groundOk.moon = !!moon;
    if (sun) {
      a.groundSun.copy(sun).multiplyScalar(GROUND_SUN_RADIUS);
      a.subSolar.copy(sun).multiplyScalar(1.004);
      this.setGlyph(GLYPH.groundSun, a.groundSun);
      this.placeDaily(this.sunCircle, sun.z, GROUND_SUN_RADIUS);
      this.placeDaily(this.subSolarTrack, sun.z, 1.004);
      // Ghost Suns: where the Sun will be, relative to the turning Earth, h hours later.
      for (let i = 0; i < 4; i++) {
        const angle = -GHOST_SUN_HOURS[i]! * EARTH_TURN_PER_HOUR * DEG;
        this.tmp.a.copy(a.groundSun).applyAxisAngle(Z, angle);
        this.setGlyph(GLYPH.ghost + i, this.tmp.a);
      }
    }
    if (moon) {
      a.groundMoon.copy(moon).multiplyScalar(GROUND_MOON_RADIUS);
      a.subLunar.copy(moon).multiplyScalar(1.004);
      this.setGlyph(GLYPH.groundMoon, a.groundMoon);
      this.placeDaily(this.moonCircle, moon.z, GROUND_MOON_RADIUS);
      this.placeDaily(this.subLunarTrack, moon.z, 1.004);
    }
    this.ready.ground = true;
  }

  /** A unit circle as the circle of declination asin(z) at distance r from the Earth's centre. */
  private placeDaily(line: THREE.Line, z: number, r: number): void {
    const c = Math.sqrt(Math.max(0, 1 - z * z));
    line.position.set(0, 0, r * z);
    line.scale.set(r * c, r * c, 1);
  }

  // --- « Les saisons »

  private updateSeasons({ date, prec }: PovState): void {
    const { a, b, helio } = this.tmp;
    const year = date.getUTCFullYear();
    if (year !== this.seasonsYear) this.buildSeasons(year);
    const sun = diagramPoint("seasons", heliocentricPosition("Earth", date, helio), prec, a);
    this.anchors.seasonsSun.copy(sun).negate();
    this.placeDiagram(this.seasons, this.anchors.seasonsSun, prec);
    this.setGlyph(GLYPH.seasonsSun, this.anchors.seasonsSun);
    const axes = this.ghostAxes.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) {
      const mark = this.anchors.marks[i]!;
      // World position: the drawn Sun plus the precessed J2000 offset of the mark.
      mark.position.copy(this.marksJ2000[i]!).applyQuaternion(this.precQuat);
      mark.position.add(this.anchors.seasonsSun);
      const sunward = b.copy(this.anchors.seasonsSun).sub(mark.position).normalize();
      this.tmp.pole.set(0, 0, 1); // the Earth's axis: the celestial pole of date
      this.tmp.prime.set(1, 0, 0);
      this.ghosts[i]!.setPose(
        mark.position,
        sunward,
        this.tmp.pole,
        this.tmp.prime,
        GHOST_EARTH_RADIUS,
      );
      const h = 1.7 * GHOST_EARTH_RADIUS;
      axes.setXYZ(2 * i, mark.position.x, mark.position.y, mark.position.z - h);
      axes.setXYZ(2 * i + 1, mark.position.x, mark.position.y, mark.position.z + h);
    }
    axes.needsUpdate = true;
    this.ghostAxes.geometry.computeBoundingSphere();
    this.ready.seasons = true;
  }

  /** Orbit over the calendar year, its four marks and the solstice and equinox lines (J2000). */
  private buildSeasons(year: number): void {
    this.seasonsYear = year;
    const s = seasons(year);
    const { helio } = this.tmp;
    const scale = (h: HeliocentricPosition, out: THREE.Vector3) =>
      out.set(h.x, h.y, h.z).multiplyScalar(SEASONS_SCALE);
    SEASON_KINDS.forEach((kind: SeasonKind, i) => {
      this.anchors.marks[i]!.date = s[kind];
      scale(heliocentricPosition("Earth", s[kind], helio), this.marksJ2000[i]!);
    });
    const pos = this.orbit.geometry.getAttribute("position") as THREE.BufferAttribute;
    const start = Date.UTC(year, 0, 1);
    for (let i = 0; i < 366; i++) {
      const p = scale(
        heliocentricPosition("Earth", new Date(start + i * DAY_MS), helio),
        this.tmp.c,
      );
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    // Closed: the last point is the first of the next year, close enough to the first.
    pos.setXYZ(365, pos.getX(0), pos.getY(0), pos.getZ(0));
    pos.needsUpdate = true;
    this.orbit.computeLineDistances();
    this.orbit.geometry.computeBoundingSphere();
    const lines = this.seasonLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const m = this.marksJ2000;
    for (const [k, [i, j]] of [
      [0, [0, 2]],
      [1, [1, 3]],
    ] as const) {
      lines.setXYZ(2 * k, m[i]!.x, m[i]!.y, m[i]!.z);
      lines.setXYZ(2 * k + 1, m[j]!.x, m[j]!.y, m[j]!.z);
    }
    lines.needsUpdate = true;
    this.seasonLines.computeLineDistances();
    this.seasonLines.geometry.computeBoundingSphere();
  }

  // --- « Le système solaire »

  private updateSolar({ date, prec }: PovState): void {
    const t = date.getTime();
    if (!(Math.abs(t - this.orbitsEpoch) < 30 * 365.25 * DAY_MS)) this.buildOrbits(date);
    const { a, b, c, helio, helio2 } = this.tmp;
    const earth = diagramPoint("solar", heliocentricPosition("Earth", date, helio), IDENTITY, b);
    const sun = this.anchors.solarSun.copy(earth).applyQuaternion(this.precOf(prec)).negate();
    this.placeDiagram(this.solar, sun, prec);
    this.setGlyph(GLYPH.solarSun, sun);
    PLANETS.forEach((planet: Planet, i) => {
      const p = diagramPoint("solar", heliocentricPosition(planet, date, helio2), IDENTITY, a);
      if (planet === "Mars") {
        // Line of sight Earth → Mars to the backdrop (J2000, Sun-centred), then to the world.
        if (lineOfSight(earth, p, BACKDROP_RADIUS, c))
          this.anchors.marsHit.copy(c).applyQuaternion(this.precQuat).add(sun);
        else this.anchors.marsHit.copy(sun);
      }
      const centre = this.anchors.planets[i]!.copy(p).applyQuaternion(this.precQuat).add(sun);
      const sunward = c.copy(sun).sub(centre).normalize();
      bodyPole(planet, prec, this.tmp.pole);
      const [x, y, z] = planetAxes(planet, date).prime;
      this.tmp.prime.set(x, y, z).applyMatrix3(prec).normalize();
      this.planetGlobes[i]!.setPose(
        centre,
        sunward,
        this.tmp.pole,
        this.tmp.prime,
        this.anchors.planetRadius[i]!,
      );
    });
    // Earth (the origin) → Mars → backdrop, world; dash lengths written by hand (no allocation).
    const line = this.marsLine.geometry;
    const pos = line.getAttribute("position") as THREE.BufferAttribute;
    const hit = this.anchors.marsHit;
    pos.setXYZ(1, hit.x, hit.y, hit.z);
    pos.needsUpdate = true;
    const dist = line.getAttribute("lineDistance") as THREE.BufferAttribute;
    dist.setX(1, hit.length());
    dist.needsUpdate = true;
    line.computeBoundingSphere();
    this.updateTrail(date, earth);
    this.ready.solar = true;
  }

  /** Each orbit sampled once round from `date` (J2000, compressed, Sun-centred). */
  private buildOrbits(date: Date): void {
    this.orbitsEpoch = date.getTime();
    const { a, helio } = this.tmp;
    ORBITING_BODIES.forEach((body: OrbitingBody, k) => {
      const pos = this.orbits[k]!.geometry.getAttribute("position") as THREE.BufferAttribute;
      const step = (ORBITAL_PERIOD_DAYS[body] * DAY_MS) / ORBIT_SAMPLES;
      for (let i = 0; i < ORBIT_SAMPLES; i++) {
        const h = heliocentricPosition(body, new Date(this.orbitsEpoch + i * step), helio);
        const p = diagramPoint("solar", h, IDENTITY, a);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      this.orbits[k]!.geometry.computeBoundingSphere();
    });
  }

  /**
   * Trace of the Earth → Mars line on the backdrop: the hit now, then every TRAIL_STEP_DAYS
   * back over six months. Samples are cached by their index (two positions per new sample).
   */
  private updateTrail(date: Date, earthNow: THREE.Vector3): void {
    const pos = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const hit = this.tmp.d;
    // The hit now, in J2000 Sun-centred axes.
    const mars = diagramPoint(
      "solar",
      heliocentricPosition("Mars", date, this.tmp.helio2),
      IDENTITY,
      this.tmp.a,
    );
    if (lineOfSight(earthNow, mars, BACKDROP_RADIUS, hit)) pos.setXYZ(0, hit.x, hit.y, hit.z);
    const step = TRAIL_STEP_DAYS * DAY_MS;
    const last = Math.floor(date.getTime() / step);
    let n = 1;
    for (let k = 0; k < TRAIL_SAMPLES; k++) {
      const index = last - k;
      const slot = ((index % TRAIL_SAMPLES) + TRAIL_SAMPLES) % TRAIL_SAMPLES;
      if (this.trailIndex[slot] !== index) {
        this.trailIndex[slot] = index;
        const when = new Date(index * step);
        const e = diagramPoint(
          "solar",
          heliocentricPosition("Earth", when, this.tmp.helio),
          IDENTITY,
          this.tmp.b,
        );
        const m = diagramPoint(
          "solar",
          heliocentricPosition("Mars", when, this.tmp.helio2),
          IDENTITY,
          this.tmp.a,
        );
        const ok = lineOfSight(e, m, BACKDROP_RADIUS, hit);
        this.trailOk[slot] = ok ? 1 : 0;
        if (ok) {
          this.trailHits[3 * slot] = hit.x;
          this.trailHits[3 * slot + 1] = hit.y;
          this.trailHits[3 * slot + 2] = hit.z;
        }
      }
      if (!this.trailOk[slot]) break;
      // Older points drawn slightly inside the backdrop (a spiral): where the line of sight
      // turns back (retrograde motion) the trace makes a visible hairpin instead of running
      // over itself.
      const j = 3 * slot;
      const age = (date.getTime() - index * step) / DAY_MS;
      const f = 1 - TRAIL_SPIRAL * Math.max(0, age);
      pos.setXYZ(
        n++,
        f * this.trailHits[j]!,
        f * this.trailHits[j + 1]!,
        f * this.trailHits[j + 2]!,
      );
    }
    this.trail.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
    this.trail.geometry.computeBoundingSphere();
  }

  // --- helpers

  /** Quaternion of the precession matrix (cached in precQuat). */
  private precOf(prec: THREE.Matrix3): THREE.Quaternion {
    const e = prec.elements;
    this.tmp.m4.set(
      e[0]!,
      e[3]!,
      e[6]!,
      0,
      e[1]!,
      e[4]!,
      e[7]!,
      0,
      e[2]!,
      e[5]!,
      e[8]!,
      0,
      0,
      0,
      0,
      1,
    );
    return this.precQuat.setFromRotationMatrix(this.tmp.m4);
  }

  /** A diagram group: J2000 axes turned to the date, on the drawn Sun. */
  private placeDiagram(group: THREE.Group, sun: THREE.Vector3, prec: THREE.Matrix3): void {
    group.position.copy(sun);
    group.quaternion.copy(this.precOf(prec));
  }

  private setGlyph(i: number, p: THREE.Vector3): void {
    this.glyphPos.setXYZ(i, p.x, p.y, p.z);
  }

  private material(opacity: number, dashed: boolean, dash = 0.06, gap = 0.05) {
    const m = dashed
      ? new THREE.LineDashedMaterial({
          transparent: true,
          opacity,
          depthWrite: false,
          dashSize: dash,
          gapSize: gap,
        })
      : new THREE.LineBasicMaterial({ transparent: true, opacity, depthWrite: false });
    m.userData.ink = true; // recoloured by SpaceView.setTheme
    return m;
  }

  private register(object: THREE.Line, view: ReferenceFrameId): void {
    const material = object.material as THREE.LineBasicMaterial;
    this.weighted.push({ material, object, view, base: material.opacity });
    object.frustumCulled = false;
    object.renderOrder = 1;
  }

  /** A polyline of the view `view`, added to the root group. */
  private line(
    points: number[],
    view: ReferenceFrameId,
    opacity: number,
    dashed: boolean,
    dash?: number,
    gap?: number,
  ): THREE.Line {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.Line(g, this.material(opacity, dashed, dash, gap));
    if (dashed) line.computeLineDistances();
    this.register(line, view);
    this.object.add(line);
    return line;
  }

  /** Separate segments (pairs of points) of the view `view`, added to the root group. */
  private lines(
    points: number[],
    view: ReferenceFrameId,
    opacity: number,
    dashed: boolean,
  ): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.LineSegments(g, this.material(opacity, dashed, 0.25, 0.2));
    if (dashed) line.computeLineDistances();
    this.register(line, view);
    this.object.add(line);
    return line;
  }
}

const Z = new THREE.Vector3(0, 0, 1);
const IDENTITY = new THREE.Matrix3();
