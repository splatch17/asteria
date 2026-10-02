import * as THREE from "three";
import {
  PLANETS,
  bodyPosition,
  greenwichMeanSiderealTime,
  precessionMatrix,
  starMotion,
  unitVector,
  yearsSinceHipparcos,
  type Observer,
  type Planet,
  type StarMotion,
  type Vec3,
} from "@asteria/astro-core";
import { bodyFrag, pathFrag, planetFrag } from "./shaders";
import { LabelLayout, type Rect } from "./labels";
import { ephemerisReliable } from "./ephemeris-range";
import { disposeObjects, watchContext } from "./lifecycle";
import { fillPathBuffers } from "./paths";
import {
  constellationLineVert,
  globeFrag,
  globeVert,
  skyBodyVert,
  skyLineFrag,
  skyLineVert,
  skyPathVert,
  skyPlanetVert,
  skyStarFrag,
  skyStarVert,
} from "./space-shaders";
import {
  DEFAULT_SKY_LAYERS,
  type CatalogStar,
  type SkyBodies,
  type SkyLayers,
  type SkyPath,
  type SkyPlanet,
  type SkySelection,
  type SkyTheme,
} from "./sky-map";
import { sphericalGrid } from "./grids";
import { RealisticLayer, type SpaceTextureName } from "./space-realistic";
import { moonAxes, planetAxes, sunwardDirection, type SpaceStyle } from "./space-style";

export type { SpaceTextureName } from "./space-realistic";

/**
 * Layers honoured by the Earth view (setLayers takes the same Partial<SkyLayers> as the map;
 * other keys are ignored): constellationLines, planets, ecliptic, equatorialGrid.
 * Defaults differ from the map: the ecliptic is shown (it explains the seasons from space).
 */
export const DEFAULT_SPACE_LAYERS: Readonly<SkyLayers> = Object.freeze({
  ...DEFAULT_SKY_LAYERS,
  ecliptic: true,
});

export interface EarthAssets {
  relief: HTMLImageElement | ImageBitmap;
  lights: HTMLImageElement | ImageBitmap;
  /** Interleaved lon/lat (degrees) and polyline offsets, as decoded by @asteria/catalog. */
  coastlines: { offsets: Uint32Array; coords: Float32Array };
}

export interface SpaceViewOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  stars: CatalogStar[];
  lines: Record<string, number[][]>;
  earth: EarthAssets;
  theme: SkyTheme;
  labels: { here: string; sun: string; moon: string; pole: string };
  /** Localised planet names, drawn as labels. */
  planetNames?: Record<Planet, string>;
  /** Formats the date of a monthly mark on the selected planet's path (localised by the caller). */
  formatPathMark?: (date: Date) => string;
  /** Tap on the Sun, the Moon or a planet (null: tap on nothing). Stars are not pickable here. */
  onSelect?: (selection: SkySelection | null) => void;
  /** Initial rendering style (default: engraving). */
  style?: SpaceStyle;
  /** Red night vision: the realistic style is drawn in shades of the theme's ink. */
  monochrome?: boolean;
  /**
   * Loads a texture of the realistic style, on demand (first switch to that style). Until it
   * arrives, or if it fails, the realistic style uses procedural colours.
   */
  loadTexture?: (name: SpaceTextureName) => Promise<HTMLImageElement | ImageBitmap>;
}

/** Sunlight on the Moon and planets is recomputed when the date moves by more than this. */
const LIGHT_REFRESH_MS = 3_600_000;

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;
const DIST_MIN = 1.6;
const DIST_MAX = 40;

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Earth-fixed unit vector for a geographic position. */
function geo(lonDeg: number, latDeg: number, r = 1): THREE.Vector3 {
  const [lon, lat] = [lonDeg * DEG, latDeg * DEG];
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ).multiplyScalar(r);
}

/**
 * The Earth seen from space, inside the celestial sphere.
 * World frame = mean equator and equinox of date (z = celestial north pole); the globe turns
 * by Greenwich sidereal time, stars and constellations sit at infinity.
 */
export class SpaceView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private readonly ctx: CanvasRenderingContext2D;
  private readonly earth = new THREE.Group(); // rotated by sidereal time
  private readonly uniforms;
  private readonly bodyPoints: THREE.Points;
  private readonly observerMarker = new THREE.Group();
  private orbit = { lon: 0, lat: 30, dist: 4 }; // camera, in world (equatorial) coordinates
  private observer: Observer = { latitude: 48.8566, longitude: 2.3522 };
  private date = new Date();
  private bodies: { sun: Vec3; moon: Vec3 } | null = null;
  private readonly planetPoints: THREE.Points;
  /** J2000 directions of the planets (PLANETS order), null when unset or hidden. */
  private planets: (Vec3 | null)[] | null = null;
  private readonly layers: SkyLayers = { ...DEFAULT_SPACE_LAYERS };
  private readonly constellationLines: THREE.LineSegments;
  private readonly eclipticLine: THREE.LineSegments;
  private readonly equatorialGrid: THREE.LineSegments;
  /** The selected planet's path (J2000 directions, precessed by the shader). */
  private readonly pathPoints: THREE.Points;
  /** Dated marks of that path: J2000 direction, world direction (follows the date), label. */
  private pathMarks: { j2000: THREE.Vector3; world: THREE.Vector3; text: string }[] = [];
  private readonly precession = new THREE.Matrix3();
  private readonly scratch = new THREE.Vector3();
  /** Date-dependent state (rotation, precession, body directions) needs recomputing. */
  private stale = true;
  private dirty = true;
  private running = false;
  private raf = 0;
  /** The WebGL context is lost: nothing is drawn until it is restored. */
  private contextLost = false;
  /** Removes every listener added by the view (input, context) on dispose. */
  private readonly listeners = new AbortController();
  /** Screen areas (CSS px) covered by the HUD, where no label is written. */
  private hudExclusions: readonly Rect[] = [];
  /** Moon and planet positions are within the validated range (see ephemeris-range.ts). */
  private ephemerisOk = true;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private velocity = { lon: 0, lat: 0 };
  private moved = 0;
  private readonly resizeObserver: ResizeObserver;
  // --- realistic style (#55), built on first use
  private style: SpaceStyle = "engraving";
  private monochrome = false;
  private real: RealisticLayer | null = null;
  private readonly globe: THREE.Mesh;
  private readonly engravedGlobe: THREE.ShaderMaterial;
  /** Objects drawn only by the engraved style. */
  private readonly engraved: THREE.Object3D[];
  /** Catalogue (J1991.25) directions and proper motions of the stars (#78). */
  private readonly motion: StarMotion;
  /** Sunward directions (J2000) of the Moon and planets, and when/where they were computed. */
  private sunward: (Vec3 | null)[] = [];
  private sunwardAt = { time: NaN, lat: NaN, lon: NaN };
  /** Selected Moon (0) or planet (1 … 7) for the enlarged realistic view; −1: none. */
  private selectedBody = -1;
  private readonly tmp = {
    dir: new THREE.Vector3(),
    light: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    prime: new THREE.Vector3(),
  };

  constructor(private readonly options: SpaceViewOptions) {
    const { canvas, overlay, stars, lines, earth } = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.ctx = overlay.getContext("2d")!;
    this.camera.up.set(0, 0, 1);

    const texture = (img: HTMLImageElement | ImageBitmap) => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };

    this.uniforms = {
      uPrec: { value: new THREE.Matrix3() },
      uDpr: { value: this.renderer.getPixelRatio() },
      uLimitMag: { value: 5.2 },
      uInk: { value: new THREE.Color() },
      uBase: { value: new THREE.Color() },
      uOpacity: { value: 0.3 },
      uRelief: { value: texture(earth.relief) },
      uLights: { value: texture(earth.lights) },
      uSunEarth: { value: new THREE.Vector3(1, 0, 0) },
      uDetail: { value: 0 },
      uBodySize: { value: 26 },
      uMoonT: { value: 0 },
      uSunAngle: { value: 0 },
      uYears: { value: 0 },
    };

    // --- Celestial sphere (at infinity)
    // Stars at the catalogue epoch, moved by their proper motion in the shader (uYears)
    const motion = starMotion(stars);
    this.motion = motion;
    const indexOf = new Map(stars.map((s, i) => [s.hip, i]));
    const starGeo = new THREE.BufferGeometry();
    const epochDirs = new THREE.BufferAttribute(motion.dirs, 3);
    starGeo.setAttribute("position", epochDirs);
    starGeo.setAttribute("aDir", epochDirs);
    starGeo.setAttribute("aPm", new THREE.BufferAttribute(motion.pm, 3));
    starGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(
        stars.map((s) => s.v),
        1,
      ),
    );
    const starPoints = new THREE.Points(starGeo, this.material(skyStarVert, skyStarFrag, true));

    // Constellation lines: each end follows its star
    const segs: number[] = [];
    const segPm: number[] = [];
    for (const polys of Object.values(lines)) {
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const ia = indexOf.get(poly[i]!);
          const ib = indexOf.get(poly[i + 1]!);
          if (ia === undefined || ib === undefined) continue;
          for (const j of [ia, ib]) {
            segs.push(motion.dirs[3 * j]!, motion.dirs[3 * j + 1]!, motion.dirs[3 * j + 2]!);
            segPm.push(motion.pm[3 * j]!, motion.pm[3 * j + 1]!, motion.pm[3 * j + 2]!);
          }
        }
      }
    }
    this.constellationLines = this.skyLines(segs, 0.28, segPm);
    const constellationLines = this.constellationLines;

    // Celestial equator and ecliptic (J2000 directions, precessed like the stars)
    const circle = (tilt: number) => {
      const pts: number[] = [];
      for (let i = 0; i < 180; i++) {
        const [a, b] = [(i / 180) * 2 * Math.PI, ((i + 1) / 180) * 2 * Math.PI];
        for (const t of [a, b])
          pts.push(Math.cos(t), Math.sin(t) * Math.cos(tilt), Math.sin(t) * Math.sin(tilt));
      }
      return pts;
    };
    const equator = this.skyLines(circle(0), 0.35);
    const ecliptic = this.skyLines(circle(OBLIQUITY), 0.5);
    this.eclipticLine = ecliptic;
    // RA/Dec grid of date: already in the world frame, so no precession (uPrec = identity).
    const equatorialGrid = this.skyLines(
      Array.from(sphericalGrid({ lonStep: 15, latStep: 10, latMax: 80 }).positions),
      0.12,
    );
    (equatorialGrid.material as THREE.ShaderMaterial).uniforms.uPrec = {
      value: new THREE.Matrix3(),
    };
    equatorialGrid.visible = false;
    this.equatorialGrid = equatorialGrid;

    // Sun and Moon glyphs (reuse the sky map's engraved fragment shader)
    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aKind", new THREE.Float32BufferAttribute([0, 1], 1));
    this.bodyPoints = new THREE.Points(bodyGeo, this.material(skyBodyVert, bodyFrag, false));
    this.bodyPoints.visible = false;

    // Planets (PLANETS order), on the celestial sphere like the Sun and Moon
    const planetGeo = new THREE.BufferGeometry();
    const planetDirs = new THREE.Float32BufferAttribute(new Float32Array(PLANETS.length * 3), 3);
    planetGeo.setAttribute("position", planetDirs);
    planetGeo.setAttribute("aDir", planetDirs);
    planetGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(new Float32Array(PLANETS.length), 1),
    );
    planetGeo.setAttribute(
      "aKind",
      new THREE.Float32BufferAttribute(
        PLANETS.map((_, i) => i),
        1,
      ),
    );
    this.planetPoints = new THREE.Points(
      planetGeo,
      this.material(skyPlanetVert, planetFrag, false),
    );
    this.planetPoints.visible = false;

    // Selected planet's path (buffers sized by setSelectedPath)
    this.pathPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      this.material(skyPathVert, pathFrag, false),
    );
    this.pathPoints.visible = false;

    for (const o of [
      this.pathPoints,
      starPoints,
      constellationLines,
      equatorialGrid,
      equator,
      ecliptic,
      this.bodyPoints,
      this.planetPoints,
    ]) {
      o.frustumCulled = false;
      o.renderOrder = 1; // after the globe, so the depth test hides what is behind the Earth
    }

    // --- Globe (Earth-fixed geometry, rotated by sidereal time)
    const globe = new THREE.Mesh(
      this.sphereGeometry(96, 48),
      this.material(globeVert, globeFrag, false),
    );
    this.globe = globe;
    this.engravedGlobe = globe.material as THREE.ShaderMaterial;
    (globe.material as THREE.ShaderMaterial).transparent = false;
    (globe.material as THREE.ShaderMaterial).depthWrite = true;
    (globe.material as THREE.ShaderMaterial).depthTest = true;

    const coastPts: number[] = [];
    const { offsets, coords } = earth.coastlines;
    for (let l = 0; l < offsets.length - 1; l++) {
      for (let i = offsets[l]!; i < offsets[l + 1]! - 1; i++) {
        const a = geo(coords[i * 2]!, coords[i * 2 + 1]!, 1.002);
        const b = geo(coords[i * 2 + 2]!, coords[i * 2 + 3]!, 1.002);
        coastPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const coast = this.surfaceLines(coastPts, 0.75);

    const grat: number[] = [];
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -88; lat < 88; lat += 4)
        grat.push(...geo(lon, lat, 1.001).toArray(), ...geo(lon, lat + 4, 1.001).toArray());
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4)
        grat.push(...geo(lon, lat, 1.001).toArray(), ...geo(lon + 4, lat, 1.001).toArray());
    }
    const graticule = this.surfaceLines(grat, 0.14);

    this.earth.add(globe, coast, graticule, this.observerMarker);
    this.engraved = [starPoints, coast, graticule];

    // Earth's axis, through the poles towards the celestial pole (fixed in the world frame)
    const axis = this.surfaceLines([0, 0, -1.5, 0, 0, 1.5], 0.6);

    this.scene.add(
      this.earth,
      axis,
      starPoints,
      constellationLines,
      equatorialGrid,
      equator,
      ecliptic,
      this.pathPoints,
      this.planetPoints,
      this.bodyPoints,
    );
    this.monochrome = options.monochrome ?? false;
    this.setTheme(options.theme);
    this.buildObserverMarker();
    watchContext(canvas, this.listeners.signal, {
      lost: () => (this.contextLost = true),
      restored: () => {
        this.contextLost = false;
        this.real?.refreshTextures();
        this.update();
      },
    });
    this.bindInput(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.setStyle(options.style ?? "engraving");
  }

  // --- public API

  /** Switches between the engraved style and the realistic one (textures loaded on demand). */
  setStyle(style: SpaceStyle): void {
    this.style = style;
    const realistic = style === "realistic";
    if (realistic && !this.real) this.buildRealistic();
    for (const o of this.engraved) o.visible = !realistic;
    this.real?.setVisible(realistic);
    this.globe.material = realistic && this.real ? this.real.globeMaterial : this.engravedGlobe;
    this.renderer.setClearColor(realistic ? "#000000" : this.options.theme.sky);
    this.update();
  }

  getStyle(): SpaceStyle {
    return this.style;
  }

  /** Red night vision for the realistic style (the engraving follows the theme's colours). */
  setMonochrome(on: boolean): void {
    this.monochrome = on;
    this.real?.setMonochrome(on, this.options.theme.ink);
    this.dirty = true;
  }

  /** Current selection, so the realistic style can show the Moon or a planet enlarged. */
  setSelection(selection: SkySelection | null): void {
    this.selectedBody =
      selection?.kind === "planet"
        ? 1 + PLANETS.indexOf(selection.planet)
        : selection?.kind === "body" && selection.body === "Moon"
          ? 0
          : -1;
    this.real?.setSelected(this.selectedBody);
    this.dirty = true;
  }

  setDate(date: Date): void {
    this.date = date;
    this.update();
  }

  setObserver(observer: Observer): void {
    const same =
      observer.latitude === this.observer.latitude &&
      observer.longitude === this.observer.longitude;
    this.observer = observer;
    if (same) return;
    this.buildObserverMarker();
    this.update();
  }

  setBodies(bodies: SkyBodies | null): void {
    this.bodies = bodies
      ? {
          sun: unitVector(bodies.sun.ra, bodies.sun.dec),
          moon: unitVector(bodies.moon.ra, bodies.moon.dec),
        }
      : null;
    if (bodies) this.uniforms.uMoonT.value = 1 - 2 * bodies.moon.illumination;
    this.update();
  }

  setPlanets(planets: SkyPlanet[] | null): void {
    if (!planets) {
      this.planets = null;
    } else {
      this.planets = PLANETS.map(() => null);
      const mags = this.planetPoints.geometry.getAttribute("aMag") as THREE.BufferAttribute;
      for (let i = 0; i < PLANETS.length; i++) mags.setX(i, 99); // left out: hidden by the shader
      for (const p of planets) {
        const i = PLANETS.indexOf(p.name);
        this.planets[i] = unitVector(p.ra, p.dec);
        mags.setX(i, p.magnitude);
      }
      mags.needsUpdate = true;
    }
    this.update();
  }

  /** Switches layers (see DEFAULT_SPACE_LAYERS); keys left out keep their state. */
  setLayers(partial: Partial<SkyLayers>): void {
    for (const key of Object.keys(partial) as (keyof SkyLayers)[]) {
      const value = partial[key];
      if (typeof value === "boolean" && key in this.layers) this.layers[key] = value;
    }
    this.constellationLines.visible = this.layers.constellationLines;
    this.eclipticLine.visible = this.layers.ecliptic;
    this.equatorialGrid.visible = this.layers.equatorialGrid;
    this.update();
  }

  getLayers(): Readonly<SkyLayers> {
    return this.layers;
  }

  /** Alias of setLayers({ planets }). */
  setPlanetsVisible(visible: boolean): void {
    this.setLayers({ planets: visible });
  }

  /** Path of the selected planet, with dated monthly marks (null: nothing selected). */
  setSelectedPath(path: SkyPath | null): void {
    fillPathBuffers(this.pathPoints, path ? [path] : []);
    this.pathMarks = [];
    const format = this.options.formatPathMark;
    if (path && format) {
      for (const pt of path.points) {
        if (!pt.mark) continue;
        const j2000 = new THREE.Vector3(...unitVector(pt.ra, pt.dec));
        const world = j2000.clone().applyMatrix3(this.precession);
        this.pathMarks.push({ j2000, world, text: format(pt.date) });
      }
    }
    this.update();
  }

  setTheme(theme: SkyTheme): void {
    this.options.theme = theme;
    this.uniforms.uInk.value.set(theme.ink);
    this.uniforms.uBase.value.set(theme.ground);
    this.renderer.setClearColor(this.style === "realistic" ? "#000000" : theme.sky);
    this.real?.setMonochrome(this.monochrome, theme.ink);
    // Surface lines (coastlines, graticule, marker) use plain materials: recolour them too.
    this.scene.traverse((o) => {
      const m = (o as THREE.LineSegments).material as THREE.LineBasicMaterial | undefined;
      if (m?.userData?.ink) m.color.set(theme.ink);
    });
    this.dirty = true;
  }

  /**
   * Places the camera: longitude/latitude in the world (equator of date) frame, in degrees, and
   * distance in Earth radii. The camera always looks at the Earth's centre.
   */
  setOrbit(orbit: Partial<{ lon: number; lat: number; dist: number }>): void {
    Object.assign(this.orbit, orbit);
    this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat));
    this.orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, this.orbit.dist));
    this.velocity = { lon: 0, lat: 0 };
    this.dirty = true;
  }

  /** Points the camera at the observer's place, at the given distance (Earth radii). */
  focusObserver(dist = 4): void {
    const gst = greenwichMeanSiderealTime(this.date);
    this.orbit = { lon: this.observer.longitude + gst, lat: this.observer.latitude, dist };
    this.velocity = { lon: 0, lat: 0 };
    this.dirty = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.dirty = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /**
   * Screen rectangles (CSS px, overlay coordinates) covered by the interface (header, buttons,
   * time controls): no label is written there, as on the sky map.
   */
  setHudExclusions(rects: readonly Rect[]): void {
    this.hudExclusions = rects.map((r) => ({ ...r }));
    this.dirty = true;
  }

  /** Stops the loop and frees listeners, geometries, materials, textures and the renderer. */
  dispose(): void {
    this.stop();
    this.listeners.abort();
    this.resizeObserver.disconnect();
    disposeObjects(this.scene);
    // The globe's material not in use (engraved or realistic) is outside the scene graph.
    this.engravedGlobe.dispose();
    this.real?.globeMaterial.dispose();
    this.renderer.dispose();
  }

  // --- internals

  private buildRealistic(): void {
    const u = this.uniforms;
    const real = new RealisticLayer(
      {
        uPrec: u.uPrec,
        uYears: u.uYears,
        uDpr: u.uDpr,
        uSunEarth: u.uSunEarth,
        uLights: u.uLights,
        uRelief: u.uRelief,
      },
      this.options.stars,
      this.motion,
    );
    real.setMonochrome(this.monochrome, this.options.theme.ink);
    real.setSelected(this.selectedBody);
    this.scene.add(...real.objects);
    this.real = real;
    const load = this.options.loadTexture;
    if (!load) return;
    for (const name of ["earth-day", "moon", "planets"] as const) {
      load(name)
        .then((image) => {
          real.setTexture(name, image);
          this.dirty = true;
        })
        .catch((e: unknown) => console.warn(`space texture ${name} unavailable`, e));
    }
  }

  /**
   * Realistic style: positions of the Sun, Moon and planets (the same directions as the engraved
   * style), plus sunlight and axes for shading. `prec`: J2000 → equator of date.
   */
  private refreshRealistic(prec: THREE.Matrix3): void {
    const real = this.real!;
    const { dir, light, pole, prime } = this.tmp;
    const t = this.date.getTime();
    const at = this.sunwardAt;
    if (
      this.ephemerisOk &&
      (!(Math.abs(t - at.time) < LIGHT_REFRESH_MS) ||
        at.lat !== this.observer.latitude ||
        at.lon !== this.observer.longitude)
    ) {
      // Distances for the sunlight geometry only; directions stay those given by the app.
      const sun = bodyPosition("Sun", this.date, this.observer);
      const sunDir = unitVector(sun.ra, sun.dec);
      this.sunward = (["Moon", ...PLANETS] as const).map((body) => {
        const p = bodyPosition(body, this.date, this.observer);
        return sunwardDirection(unitVector(p.ra, p.dec), p.distanceKm, sunDir, sun.distanceKm);
      });
      this.sunwardAt = { time: t, lat: this.observer.latitude, lon: this.observer.longitude };
    }
    const toWorld = (v: Vec3, out: THREE.Vector3) => out.set(...v).applyMatrix3(prec);

    if (this.bodies) real.setSun(toWorld(this.bodies.sun, dir));
    else real.setSun(null);
    if (this.bodies && this.ephemerisOk) {
      const axes = moonAxes(this.bodies.moon);
      real.setBody(
        0,
        toWorld(this.bodies.moon, dir),
        toWorld(this.sunward[0]!, light),
        toWorld(axes.pole, pole),
        toWorld(axes.prime, prime),
        -12,
      );
    } else {
      real.setBody(0, null, light, pole, prime, 99);
    }
    const mags = this.planetPoints.geometry.getAttribute("aMag") as THREE.BufferAttribute;
    PLANETS.forEach((planet, i) => {
      const d = this.ephemerisOk ? this.planets?.[i] : null;
      if (!d) {
        real.setBody(i + 1, null, light, pole, prime, 99);
        return;
      }
      const axes = planetAxes(planet, this.date);
      real.setBody(
        i + 1,
        toWorld(d, dir),
        toWorld(this.sunward[i + 1]!, light),
        toWorld(axes.pole, pole),
        toWorld(axes.prime, prime),
        mags.getX(i),
      );
    });
    real.setPlanetsShown(this.layers.planets);
    real.setVisible(this.style === "realistic");
  }

  private material(vertexShader: string, fragmentShader: string, additive: boolean) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  /** Lines at infinity; with `pm` (proper motions, rad/yr) each vertex follows its star. */
  private skyLines(points: number[], opacity: number, pm?: number[]): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    const dirs = new THREE.Float32BufferAttribute(points, 3);
    g.setAttribute("position", dirs);
    g.setAttribute("aDir", dirs);
    if (pm) g.setAttribute("aPm", new THREE.Float32BufferAttribute(pm, 3));
    const m = this.material(pm ? constellationLineVert : skyLineVert, skyLineFrag, false);
    m.uniforms = { ...this.uniforms, uOpacity: { value: opacity } };
    return new THREE.LineSegments(g, m);
  }

  private surfaceLines(points: number[], opacity: number): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const m = new THREE.LineBasicMaterial({ transparent: true, opacity, depthWrite: false });
    m.userData.ink = true; // recoloured by setTheme
    return new THREE.LineSegments(g, m);
  }

  private sphereGeometry(segLon: number, segLat: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= segLat; j++) {
      const lat = 90 - (180 * j) / segLat;
      for (let i = 0; i <= segLon; i++) pos.push(...geo(-180 + (360 * i) / segLon, lat).toArray());
    }
    for (let j = 0; j < segLat; j++) {
      for (let i = 0; i < segLon; i++) {
        const a = j * (segLon + 1) + i;
        const b = a + segLon + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    return g;
  }

  /** "You are here": dot, local horizon disc and zenith line, in Earth-fixed coordinates. */
  private buildObserverMarker(): void {
    for (const o of this.observerMarker.children as THREE.LineSegments[]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.observerMarker.clear();
    const { latitude, longitude } = this.observer;
    const up = geo(longitude, latitude);
    const east = new THREE.Vector3(-Math.sin(longitude * DEG), Math.cos(longitude * DEG), 0);
    const north = new THREE.Vector3().crossVectors(up, east);
    const centre = up.clone().multiplyScalar(1.004);
    const disc: number[] = [];
    const r = 0.14;
    for (let i = 0; i < 64; i++) {
      for (const k of [i, i + 1]) {
        const t = (k / 64) * 2 * Math.PI;
        const p = centre
          .clone()
          .addScaledVector(east, Math.cos(t) * r)
          .addScaledVector(north, Math.sin(t) * r);
        disc.push(p.x, p.y, p.z);
      }
    }
    const zenith = [...centre.toArray(), ...up.clone().multiplyScalar(1.3).toArray()];
    this.observerMarker.add(this.surfaceLines(disc, 0.95), this.surfaceLines(zenith, 0.95));
    this.setTheme(this.options.theme);
  }

  /** Marks the date-dependent state stale; it is recomputed once, before the next frame. */
  private update(): void {
    this.stale = true;
    this.dirty = true;
  }

  private refresh(): void {
    this.stale = false;
    this.ephemerisOk = ephemerisReliable(this.date);
    const gst = greenwichMeanSiderealTime(this.date) * DEG;
    this.earth.rotation.set(0, 0, gst);
    const prec = this.precession.set(...precessionMatrix(this.date));
    this.uniforms.uPrec.value.copy(prec);
    this.uniforms.uYears.value = yearsSinceHipparcos(this.date);
    for (const m of this.pathMarks) m.world.copy(m.j2000).applyMatrix3(prec);
    const v = this.scratch;
    if (this.bodies) {
      const dirs = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      v.set(...this.bodies.moon).applyMatrix3(prec);
      dirs.setXYZ(1, v.x, v.y, v.z);
      v.set(...this.bodies.sun).applyMatrix3(prec);
      dirs.setXYZ(0, v.x, v.y, v.z);
      dirs.needsUpdate = true;
      // Sun in the Earth-fixed frame lights the globe (terminator, night lights).
      this.uniforms.uSunEarth.value.copy(v).applyAxisAngle(Z_AXIS, -gst);
    }
    if (this.planets) {
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      this.planets.forEach((d, i) => {
        if (d) v.set(...d).applyMatrix3(prec);
        else v.set(0, 0, 1);
        dirs.setXYZ(i, v.x, v.y, v.z);
      });
      dirs.needsUpdate = true;
    }
    const engraved = this.style === "engraving";
    this.bodyPoints.visible = engraved && !!this.bodies;
    // Sun = point 0, Moon = point 1 (hidden out of the ephemeris range).
    this.bodyPoints.geometry.setDrawRange(0, this.ephemerisOk ? 2 : 1);
    this.planetPoints.visible = engraved && this.planetsShown();
    this.pathPoints.visible =
      this.layers.planets && this.ephemerisOk && this.pathPoints.geometry.drawRange.count > 0;
    if (this.real && !engraved) this.refreshRealistic(prec);
  }

  /** Planets are drawn (layer on, data given, date within the ephemeris range). */
  private planetsShown(): boolean {
    return this.layers.planets && this.ephemerisOk && !!this.planets;
  }

  private resize(): void {
    const { canvas, overlay } = this.options;
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.contextLost) return;
    if (
      !this.pointers.size &&
      (Math.abs(this.velocity.lon) > 0.01 || Math.abs(this.velocity.lat) > 0.01)
    ) {
      this.orbit.lon += this.velocity.lon;
      this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat + this.velocity.lat));
      this.velocity.lon *= 0.9;
      this.velocity.lat *= 0.9;
      this.dirty = true;
    }
    if (this.stale) this.refresh();
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  };

  private render(): void {
    const { lon, lat, dist } = this.orbit;
    this.camera.position.copy(geo(lon, lat, dist));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    // Mix with zoom: engraved from afar, relief shows through when close.
    this.uniforms.uDetail.value = Math.min(1, Math.max(0, (6 - dist) / 3.5));
    if (this.style === "realistic")
      this.real?.setCameraEarth(this.camera.position, this.earth.rotation.z);
    if (this.bodies) {
      const sun = this.screenOf(this.dirAt(0));
      const moon = this.screenOf(this.dirAt(1));
      if (sun && moon)
        this.uniforms.uSunAngle.value = Math.atan2(-(sun[1] - moon[1]), sun[0] - moon[0]);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  private dirAt(i: number): THREE.Vector3 {
    const a = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
    return new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
  }

  /** Screen position of a world point, or of a direction at infinity (w = 0). */
  private screenOf(p: THREE.Vector3, atInfinity = true): [number, number] | null {
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const v = atInfinity ? p.clone().multiplyScalar(1000).add(this.camera.position) : p.clone();
    const toCam = v.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (toCam.dot(forward) <= 0) return null;
    v.project(this.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  /** True when the segment camera → world point passes through the globe. */
  private hiddenByEarth(p: THREE.Vector3, atInfinity: boolean): boolean {
    const o = this.camera.position;
    const d = (atInfinity ? p.clone() : p.clone().sub(o)).normalize();
    const b = o.dot(d);
    const c = o.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && (atInfinity || t < p.distanceTo(o) - 1e-3);
  }

  /**
   * Labels, by priority, placed without overlaps and outside the HUD (setHudExclusions): "you
   * are here", Sun, Moon, planets, celestial pole, then the dated marks of the selected path.
   */
  private drawLabels(): void {
    const { ctx } = this;
    const { canvas, theme, labels } = this.options;
    const { clientWidth: width, clientHeight: height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
    // No label under the HUD, nor cut by the top or bottom edge.
    const layout = new LabelLayout([
      ...this.hudExclusions,
      { x: -width, y: -100, w: 3 * width, h: 100 },
      { x: -width, y: height, w: 3 * width, h: 100 },
    ]);
    const H = 12;
    const font = (weightSize: string, spacing: string) => {
      ctx.font = `${weightSize} 'JetBrains Mono', monospace`;
      ctx.letterSpacing = spacing;
    };
    /** A label beside a point: right, left, above, below; `dx` clears the glyph drawn there. */
    const label = (text: string, p: THREE.Vector3, atInfinity: boolean, dx = 10) => {
      if (this.hiddenByEarth(p, atInfinity)) return;
      const s = this.screenOf(p, atInfinity);
      if (!s) return;
      const [x, y] = s;
      const t = text.toUpperCase();
      const w = ctx.measureText(t).width;
      const r = layout.place([
        { x: x + dx, y: y - H / 2, w, h: H },
        { x: x - dx - w, y: y - H / 2, w, h: H },
        { x: x - w / 2, y: y - dx - H, w, h: H },
        { x: x - w / 2, y: y + dx, w, h: H },
      ]);
      if (r) ctx.fillText(t, r.x, r.y + H / 2);
    };
    font("700 11px", "0.12em");
    const here = geo(this.observer.longitude, this.observer.latitude, 1.3).applyMatrix4(
      this.earth.matrixWorld,
    );
    label(labels.here, here, false);
    if (this.bodies) {
      label(labels.sun, this.dirAt(0), true, 20);
      if (this.ephemerisOk) label(labels.moon, this.dirAt(1), true, this.labelOffset(0, 18));
    }
    const names = this.options.planetNames;
    if (this.planetsShown() && this.planets && names) {
      font("700 10px", "0.12em");
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      const d = new THREE.Vector3();
      this.planets.forEach((p, i) => {
        if (!p) return;
        label(
          names[PLANETS[i]!],
          d.fromBufferAttribute(dirs, i),
          true,
          this.labelOffset(i + 1, 12),
        );
      });
    }
    font("700 11px", "0.12em");
    label(labels.pole, new THREE.Vector3(0, 0, 1), true);
    // Dated monthly marks of the selected planet's path (lowest priority).
    if (this.pathPoints.visible && this.pathMarks.length) {
      font("400 9px", "0.06em");
      ctx.globalAlpha = 0.65;
      const h = 10;
      for (const { world, text } of this.pathMarks) {
        if (this.hiddenByEarth(world, true)) continue;
        const s = this.screenOf(world, true);
        if (!s) continue;
        const w = ctx.measureText(text).width;
        const [x, y] = s;
        const r = layout.place([
          { x: x + 6, y: y - h, w, h },
          { x: x - 6 - w, y: y - h, w, h },
          { x: x + 6, y, w, h },
          { x: x - 6 - w, y, w, h },
        ]);
        if (r) ctx.fillText(text, r.x, r.y + h / 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Label offset (CSS px) beside the Moon (0) or a planet (1 … 7): clears enlarged sprites. */
  private labelOffset(index: number, min: number): number {
    if (this.style !== "realistic" || !this.real) return min;
    // Planet sprites hold 1.6 radii (Saturn: 2.4 for the rings); the Moon's is its disc.
    const half = this.real.spriteSize(index) / 2;
    return Math.max(min, (index === 0 ? half : half / 1.6) + 8);
  }

  /** Sun, Moon or planet under a tap (CSS px), unless hidden behind the globe. */
  private pick(x: number, y: number): SkySelection | null {
    let best: SkySelection | null = null;
    let bestDist = Infinity;
    const consider = (dir: THREE.Vector3, radius: number, selection: SkySelection) => {
      if (this.hiddenByEarth(dir, true)) return;
      const s = this.screenOf(dir, true);
      if (!s) return;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < radius && d < bestDist) [best, bestDist] = [selection, d];
    };
    // Realistic sprites can be larger (selected planet, Moon): pick within their disc.
    const real = this.style === "realistic" ? this.real : null;
    const radius = (index: number, min: number) =>
      Math.max(min, real ? real.spriteSize(index) / (index > 0 ? 3.2 : 2) : 0);
    if (this.bodies) {
      const r = Math.max(22, this.uniforms.uBodySize.value / 2);
      consider(this.dirAt(0), r, { kind: "body", body: "Sun" });
      if (this.ephemerisOk) consider(this.dirAt(1), radius(0, r), { kind: "body", body: "Moon" });
    }
    if (this.planetsShown() && this.planets) {
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      this.planets.forEach((p, i) => {
        if (p)
          consider(new THREE.Vector3().fromBufferAttribute(dirs, i), radius(i + 1, 22), {
            kind: "planet",
            planet: PLANETS[i]!,
          });
      });
    }
    return best;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const signal = this.listeners.signal;
    canvas.style.touchAction = "none";
    let pinch = 0;
    const distance = () => {
      const [a, b] = [...this.pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    canvas.addEventListener(
      "pointerdown",
      (e) => {
        canvas.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.velocity = { lon: 0, lat: 0 };
        this.moved = 0;
        if (this.pointers.size === 2) pinch = distance();
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        const prev = this.pointers.get(e.pointerId);
        if (!prev) return;
        const [dx, dy] = [e.clientX - prev.x, e.clientY - prev.y];
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointers.size === 1) {
          // Dragging turns the globe under the finger (the camera orbits the other way).
          const k = (60 / canvas.clientHeight) * (this.orbit.dist / 4);
          this.velocity = { lon: -dx * k, lat: dy * k };
          this.orbit.lon += this.velocity.lon;
          this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat + this.velocity.lat));
        } else if (this.pointers.size === 2) {
          const d = distance();
          if (pinch > 0) this.zoom(pinch / d);
          pinch = d;
        }
        this.dirty = true;
      },
      { signal },
    );
    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0 && this.moved < 6 && e.type === "pointerup") {
        const rect = canvas.getBoundingClientRect();
        this.options.onSelect?.(this.pick(e.clientX - rect.left, e.clientY - rect.top));
      }
      pinch = 0;
    };
    canvas.addEventListener("pointerup", end, { signal });
    canvas.addEventListener("pointercancel", end, { signal });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false, signal },
    );
  }

  private zoom(factor: number): void {
    this.orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, this.orbit.dist * factor));
    this.dirty = true;
  }
}
