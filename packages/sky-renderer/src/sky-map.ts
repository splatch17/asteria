/**
 * SkyMap — the stereographic sky map (alt-az, GPU projection).
 *
 * Layers API (#54): everything optional on the map is a layer, switched with
 *
 *   map.setLayers(partial: Partial<SkyLayers>): void   // only the given keys change
 *   map.getLayers(): Readonly<SkyLayers>                // current state (do not mutate)
 *
 * with SkyLayers = {
 *   constellationLines, constellationNames, starNames, planets,
 *   allPaths,        // every planet's ±6-month path, undated (data from setPaths)
 *   equatorialGrid,  // RA/Dec of date, 1 h / 10°, labelled in hours and degrees
 *   azimuthalGrid,   // azimuth/altitude, 15° / 10°, labelled in degrees
 *   ecliptic,        // J2000 ecliptic, dashed, graduated every 30° of longitude of date
 *   seeThroughGround, // #65: what is below the horizon stays drawn, dimmed (see see-through.ts)
 * } (all booleans; defaults in DEFAULT_SKY_LAYERS). The selected planet's path does not depend
 * on allPaths (it follows setSelectedPath, and hides with `planets`).
 * New layers (Milky Way, Messier, ISS, boundaries…) are added as new keys: callers that pass
 * partial objects keep working. setLinesVisible / setPlanetsVisible / setPathsVisible remain as
 * aliases. Graduation labels can be localised with the `formatGraduation` option.
 * No label (cardinal points, bodies, stars, constellations, path dates, graduations) is written
 * under the HUD: setHudExclusions(rects) gives its areas (CSS px, overlay coordinates);
 * setGraduationExclusions remains as an alias.
 */
import * as THREE from "three";
import {
  PLANETS,
  applyMat3,
  equatorialToHorizontalMatrix,
  j2000ToHorizontalMatrix,
  multiplyMat3,
  unitVector,
  type Mat3,
  type Observer,
  type Planet,
  type Vec3,
} from "@asteria/astro-core";
import {
  bodyFrag,
  bodyVert,
  groundFrag,
  groundVert,
  guideFrag,
  guideVert,
  lineFrag,
  lineVert,
  pathFrag,
  pathVert,
  planetFrag,
  planetVert,
  starFrag,
  starVert,
} from "./shaders";
import { LabelLayout, type Rect } from "./labels";
import { pickFigure, pickLabel, type FigureShape, type Point } from "./figure-pick";
import { fillPathBuffers } from "./paths";
import { limitingMagnitude, planetLimitingMagnitude } from "./limits";
import { belowHorizonAlpha, belowHorizonLimits, horizonPasses, labelAlpha } from "./see-through";
import { eclipticCircle, eclipticOfDate, graduationLines, spherical, sphericalGrid } from "./grids";
import { projectStereo, stereoScale, viewMatrix, type ViewState } from "./view";

export interface CatalogStar {
  hip: number;
  ra: number;
  dec: number;
  v: number;
  bv?: number;
  plx?: number;
  name?: string;
  bayer?: string;
  con: string;
}

export interface SkyTheme {
  ink: string;
  sky: string;
  /** Sky colour in full daylight (twilight blends from `sky`). */
  daySky: string;
  ground: string;
}

export type BodyName = "Sun" | "Moon";

/** Positions of the Sun and Moon (astrometric J2000, topocentric) and the lunar phase. */
export interface SkyBodies {
  sun: { ra: number; dec: number };
  moon: { ra: number; dec: number; illumination: number };
}

/** A planet's astrometric J2000 position (topocentric) and apparent magnitude. */
export interface SkyPlanet {
  name: Planet;
  ra: number;
  dec: number;
  magnitude: number;
}

/**
 * Apparent path of a planet, sampled regularly. Points flagged `mark` (the caller puts one at the
 * start of each month) are drawn larger and, on the selected planet's path, dated.
 */
export interface SkyPath {
  name: Planet;
  points: { date: Date; ra: number; dec: number; mark?: boolean }[];
}

export type SkySelection =
  | { kind: "star"; star: CatalogStar }
  | { kind: "body"; body: BodyName }
  | { kind: "planet"; planet: Planet }
  /** Picked by its name label, or by a tap inside its figure away from any star (#61). */
  | { kind: "constellation"; abbr: string };

/** Switchable layers of the sky map (see the file header). */
export interface SkyLayers {
  constellationLines: boolean;
  constellationNames: boolean;
  starNames: boolean;
  planets: boolean;
  /** Every planet's path at once, undated. */
  allPaths: boolean;
  /** Right ascension / declination grid (equator of date). */
  equatorialGrid: boolean;
  /** Azimuth / altitude grid. */
  azimuthalGrid: boolean;
  ecliptic: boolean;
  /**
   * See through the Earth (#65): stars, lines, bodies, grids and labels below the horizon stay
   * drawn, dimmed (BELOW_HORIZON_ALPHA), over a tinted ground, and can be tapped. Off: opaque
   * ground.
   */
  seeThroughGround: boolean;
}

export const DEFAULT_SKY_LAYERS: Readonly<SkyLayers> = Object.freeze({
  constellationLines: true,
  constellationNames: true,
  starNames: true,
  planets: true,
  allPaths: false,
  equatorialGrid: false,
  azimuthalGrid: false,
  ecliptic: false,
  seeThroughGround: true,
});

/** What a graduation label measures: value in degrees (RA too: 30 = 2 h). */
export type GraduationKind = "ra" | "dec" | "az" | "alt" | "ecliptic";

/** Default graduation text: "2h", "+30°", "−20°", "120°". */
export function formatGraduation(kind: GraduationKind, value: number): string {
  if (kind === "ra") return `${Math.round(value / 15)}h`;
  if (kind === "dec" || kind === "alt") {
    const sign = value > 0 && kind === "dec" ? "+" : value < 0 ? "−" : "";
    return `${sign}${Math.abs(value)}°`;
  }
  return `${value}°`;
}

/** Grid spacing (degrees) and label spacing for a field of view. */
const GRID = { lon: 15, lat: 10 };
const labelSteps = (fov: number) => (fov > 60 ? { lon: 30, lat: 20 } : { lon: 15, lat: 10 });

export interface SkyMapOptions {
  canvas: HTMLCanvasElement;
  /** 2D canvas stacked on top, used for labels. */
  overlay: HTMLCanvasElement;
  /** Sorted by increasing magnitude (brightest first): star names rely on it. */
  stars: CatalogStar[];
  /** Constellation abbreviation → polylines of HIP numbers. */
  lines: Record<string, number[][]>;
  /** Constellation abbreviation → display name (localised by the caller). */
  constellationNames?: Record<string, string>;
  /** Cardinal point labels, clockwise from North (8 entries). */
  cardinals?: string[];
  theme: SkyTheme;
  /** Localised names of the Sun and Moon, drawn as labels. */
  bodyNames?: Record<BodyName, string>;
  /** Localised planet names, drawn as labels. */
  planetNames?: Record<Planet, string>;
  /** Formats the date of a monthly mark on the planets' paths (localised by the caller). */
  formatPathMark?: (date: Date) => string;
  onSelect?: (selection: SkySelection | null) => void;
  /** Called after each rendered frame whose view changed (compass needle, etc.). */
  onViewChange?: (view: Readonly<ViewState>) => void;
  /** Label for what the central reticle points at, when sensor pointing is on. */
  describeTarget?: (selection: SkySelection) => string;
  /**
   * Horizontal one-finger drag while sensor pointing is on (degrees of azimuth, same sign as a
   * normal drag): lets the caller shift a compass-less heading by hand. Ignored when absent.
   */
  onPointingDrag?: (deltaAzimuth: number) => void;
  /** Text of the grid and ecliptic graduations (default: formatGraduation). */
  formatGraduation?: (kind: GraduationKind, value: number) => string;
  /** Initial layers (default: DEFAULT_SKY_LAYERS). */
  layers?: Partial<SkyLayers>;
}

const FOV_MIN = 2;
const FOV_MAX = 200;
const FRICTION = 0.9;

const toThreeMat3 = (m: Mat3) => new THREE.Matrix3().set(...m);
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** On-screen radius (CSS px) of a planet's disc, mirroring planetVert. */
function planetRadius(p: { name: Planet; magnitude: number }): number {
  const size = Math.min(20, Math.max(7, 11 - p.magnitude * 1.6));
  return (size * (p.name === "Saturn" ? 1.6 : 1)) / 2;
}

export class SkyMap {
  readonly view: ViewState = { azimuth: 180, altitude: 35, fov: 100, roll: 0 };
  private observer: Observer = { latitude: 48.8566, longitude: 2.3522 };
  private date = new Date();
  private readonly layers: SkyLayers = { ...DEFAULT_SKY_LAYERS };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uniforms;
  private readonly lineMesh: THREE.LineSegments;
  /** Full-screen ground: drawn last when opaque, first when seen through. */
  private readonly ground: THREE.Mesh;
  private readonly bodyPoints: THREE.Points;
  private bodies: { sun: Vec3; moon: Vec3; illumination: number } | null = null;
  private readonly planetPoints: THREE.Points;
  /** Current planets, in PLANETS order (direction and magnitude), null when unset. */
  private planets: { name: Planet; dir: Vec3; magnitude: number }[] | null = null;
  /** All planets' paths (the "all paths" layer, undated, off by default). */
  private readonly pathPoints: THREE.Points;
  /** Reference lines; aDir in their own frame, uFrame → horizontal. */
  private readonly equatorialGrid: THREE.LineSegments;
  private readonly azimuthalGrid: THREE.LineSegments;
  private readonly eclipticLine: THREE.LineSegments;
  /** Equator of date → horizontal (frame of the RA/Dec grid). */
  private date2hor: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  /** Graduation texts, by kind and value (built once). */
  private readonly graduationTexts = new Map<string, string>();
  /** Screen areas (CSS px) covered by the HUD, where graduations are not written. */
  private hudExclusions: readonly Rect[] = [];
  /** Horizon side of the graduation pass being drawn (see horizonPasses). */
  private graduationBelow = false;
  /** View matrix of the frame being labelled. */
  private labelView: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  /** The selected planet's path, with dated monthly marks. */
  private readonly selectedPathPoints: THREE.Points;
  private pathMarks: { dir: Vec3; text: string; width: number }[] = [];
  /** 0 = dark night … 1 = full daylight, from the Sun's altitude. */
  private daylight = 0;
  private sunAltitude = -90;
  /** Current label font (see setLabelFont) and cached text widths per font. */
  private fontKey = "";
  private readonly textWidths = new Map<string, Map<string, number>>();
  private widths = new Map<string, number>();
  private readonly starDirs: Vec3[];
  private readonly labels: { abbr: string; text: string; dir: Vec3 }[];
  /** Constellation figures as J2000 segments, for highlighting and picking (#61). */
  private readonly figures: { abbr: string; segments: [Vec3, Vec3][] }[] = [];
  private selectedConstellation: string | null = null;
  /** Constellation labels drawn in the last frame (CSS px), for picking. */
  private constellationLabelRects: { abbr: string; rect: Rect }[] = [];
  /** 1-bit checkerboard of the ink colour, for the selected figure's stroke. */
  private figurePattern: { ink: string; pattern: CanvasPattern | null } | null = null;
  private eq2hor: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private dirty = true;
  /** Sensor pointing: finger rotation is disabled (pinch zoom stays), reticle is shown. */
  private pointing = false;
  private animation: { from: ViewState; to: ViewState; start: number; duration: number } | null =
    null;
  private raf = 0;
  private velocity = { az: 0, alt: 0 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private readonly resizeObserver: ResizeObserver;
  /** Canvas size in CSS px, kept by resize(): read for every projected label, it avoids layout reads. */
  private size = { w: 1, h: 1 };

  constructor(private readonly options: SkyMapOptions) {
    const { canvas, overlay, stars, lines } = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.ctx = overlay.getContext("2d")!;

    this.uniforms = {
      uEq2Hor: { value: new THREE.Matrix3() },
      uView: { value: new THREE.Matrix3() },
      uViewInv: { value: new THREE.Matrix3() },
      uScale: { value: 1 },
      uAspect: { value: 1 },
      uDpr: { value: this.renderer.getPixelRatio() },
      uLimitMag: { value: 5 },
      uPlanetLimit: { value: 9 },
      uLimitMagBelow: { value: 5 },
      uPlanetLimitBelow: { value: 9 },
      uBelowAlpha: { value: 0 },
      uInk: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uLineOpacity: { value: 0.45 },
      uBodySize: { value: 32 },
      uMoonT: { value: 0 },
      uSunAngle: { value: 0 },
    };

    this.starDirs = stars.map((s) => unitVector(s.ra, s.dec));
    const byHip = new Map(stars.map((s, i) => [s.hip, this.starDirs[i]!]));

    // Stars
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(this.starDirs.flat(), 3));
    starGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(this.starDirs.flat(), 3));
    starGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(
        stars.map((s) => s.v),
        1,
      ),
    );
    const starPoints = new THREE.Points(starGeo, this.material(starVert, starFrag, true));
    starPoints.frustumCulled = false;

    // Constellation lines
    const segs: number[] = [];
    for (const [abbr, polys] of Object.entries(lines)) {
      const figure: [Vec3, Vec3][] = [];
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = byHip.get(poly[i]!);
          const b = byHip.get(poly[i + 1]!);
          if (a && b) {
            segs.push(...a, ...b);
            figure.push([a, b]);
          }
        }
      }
      this.figures.push({ abbr, segments: figure });
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    lineGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(segs, 3));
    this.lineMesh = new THREE.LineSegments(lineGeo, this.material(lineVert, lineFrag, false));
    this.lineMesh.frustumCulled = false;

    // Ground (full-screen; drawn last to hide what is below the horizon, or first when the
    // seeThroughGround layer is on: see setLayers)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material(groundVert, groundFrag, false),
    );
    ground.frustumCulled = false;
    this.ground = ground;

    // Sun and Moon (positions set by setBodies)
    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aKind", new THREE.Float32BufferAttribute([0, 1], 1));
    this.bodyPoints = new THREE.Points(bodyGeo, this.material(bodyVert, bodyFrag, false));
    this.bodyPoints.frustumCulled = false;
    this.bodyPoints.visible = false;

    // Planets (one point each, PLANETS order; positions set by setPlanets)
    const planetGeo = new THREE.BufferGeometry();
    const n = PLANETS.length;
    const planetDirs = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3);
    planetGeo.setAttribute("position", planetDirs);
    planetGeo.setAttribute("aDir", planetDirs);
    planetGeo.setAttribute("aMag", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    planetGeo.setAttribute(
      "aKind",
      new THREE.Float32BufferAttribute(
        PLANETS.map((_, i) => i),
        1,
      ),
    );
    this.planetPoints = new THREE.Points(planetGeo, this.material(planetVert, planetFrag, false));
    this.planetPoints.frustumCulled = false;
    this.planetPoints.visible = false;

    // Apparent paths (dotted; buffers sized by setPaths / setSelectedPath)
    const pathLayer = () => {
      const points = new THREE.Points(
        new THREE.BufferGeometry(),
        this.material(pathVert, pathFrag, false),
      );
      points.frustumCulled = false;
      points.visible = false;
      return points;
    };
    this.pathPoints = pathLayer();
    this.selectedPathPoints = pathLayer();

    // Reference lines: stippled (1-bit) wires; the azimuthal grid is dashed to tell it apart.
    const grid = sphericalGrid({ lonStep: GRID.lon, latStep: GRID.lat, latMax: 80 });
    this.equatorialGrid = this.guide(grid.positions, grid.dash, {
      opacity: 0.55,
      density: 0.5,
      dash: 0,
    });
    const altAz = sphericalGrid({ lonStep: GRID.lon, latStep: GRID.lat, latMax: 80, latMin: 0 });
    this.azimuthalGrid = this.guide(altAz.positions, altAz.dash, {
      opacity: 0.5,
      density: 0.5,
      dash: 1.5,
    });
    const ecl = eclipticCircle(1);
    this.eclipticLine = this.guide(ecl.positions, ecl.longitudes, {
      opacity: 0.8,
      density: 0.85,
      dash: 3,
    });

    this.scene.add(
      this.azimuthalGrid,
      this.equatorialGrid,
      this.eclipticLine,
      this.lineMesh,
      this.pathPoints,
      this.selectedPathPoints,
      starPoints,
      this.planetPoints,
      this.bodyPoints,
      ground,
    );

    // Constellation labels at the normalized centroid of their line stars
    this.labels = Object.entries(lines).map(([abbr, polys]) => {
      const dirs = polys
        .flat()
        .map((h) => byHip.get(h))
        .filter((d): d is Vec3 => !!d);
      const c = dirs.reduce<Vec3>((s, d) => [s[0] + d[0], s[1] + d[1], s[2] + d[2]], [0, 0, 0]);
      const n = Math.hypot(...c) || 1;
      return {
        abbr,
        text: options.constellationNames?.[abbr] ?? abbr,
        dir: [c[0] / n, c[1] / n, c[2] / n],
      };
    });

    this.setLayers(options.layers ?? {});
    this.setTheme(options.theme);
    // Widths measured before the web font finished loading are wrong: measure again.
    document.fonts?.addEventListener("loadingdone", () => {
      this.textWidths.clear();
      this.fontKey = "";
      for (const m of this.pathMarks) m.width = -1;
      this.dirty = true;
    });
    this.bindInput(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.updateSky();
    this.loop();
  }

  /** A reference-line layer; its uFrame is updated with the date (see updateSky). */
  private guide(
    positions: Float32Array,
    dash: Float32Array,
    style: { opacity: number; density: number; dash: number },
  ): THREE.LineSegments {
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute("position", attr);
    geo.setAttribute("aDir", attr);
    geo.setAttribute("aDash", new THREE.BufferAttribute(dash, 1));
    const material = this.material(guideVert, guideFrag, false);
    material.uniforms = {
      ...this.uniforms,
      uFrame: { value: new THREE.Matrix3() },
      uOpacity: { value: style.opacity },
      uDensity: { value: style.density },
      uDash: { value: style.dash },
    };
    const lines = new THREE.LineSegments(geo, material);
    lines.frustumCulled = false;
    lines.visible = false;
    return lines;
  }

  private material(vertexShader: string, fragmentShader: string, additive: boolean) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  // --- public API

  setDate(date: Date): void {
    this.date = date;
    this.updateSky();
  }

  getDate(): Date {
    return this.date;
  }

  setObserver(observer: Observer): void {
    this.observer = observer;
    this.updateSky();
  }

  setView(view: Partial<ViewState>): void {
    Object.assign(this.view, view);
    this.clampView();
    this.dirty = true;
  }

  /** Smoothly turns the view (shortest way round in azimuth). */
  animateTo(target: Partial<ViewState>, duration = 600): void {
    const from = { ...this.view };
    const to = { ...from, ...target };
    to.azimuth = from.azimuth + ((((to.azimuth - from.azimuth) % 360) + 540) % 360) - 180;
    this.velocity = { az: 0, alt: 0 };
    this.animation = { from, to, start: performance.now(), duration };
  }

  /** Sensor-driven pointing (the caller feeds setView with the phone orientation). */
  setPointing(on: boolean): void {
    this.pointing = on;
    this.animation = null;
    this.velocity = { az: 0, alt: 0 };
    if (!on) this.view.roll = 0;
    this.dirty = true;
  }

  setTheme(theme: SkyTheme): void {
    this.uniforms.uInk.value.set(theme.ink);
    this.uniforms.uGround.value.set(theme.ground);
    this.options.theme = theme;
    this.updateDaylight();
    this.dirty = true;
  }

  setBodies(bodies: SkyBodies | null): void {
    if (!bodies) {
      this.bodies = null;
      this.bodyPoints.visible = false;
    } else {
      const sun = unitVector(bodies.sun.ra, bodies.sun.dec);
      const moon = unitVector(bodies.moon.ra, bodies.moon.dec);
      this.bodies = { sun, moon, illumination: bodies.moon.illumination };
      const dirs = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      dirs.set([...sun, ...moon]);
      dirs.needsUpdate = true;
      this.uniforms.uMoonT.value = 1 - 2 * bodies.moon.illumination;
      this.bodyPoints.visible = true;
    }
    this.updateDaylight();
    this.dirty = true;
  }

  /** Planet positions, called on each date change: buffers are updated in place. */
  setPlanets(planets: SkyPlanet[] | null): void {
    if (!planets) {
      this.planets = null;
    } else {
      const geo = this.planetPoints.geometry;
      const dirs = geo.getAttribute("aDir") as THREE.BufferAttribute;
      const mags = geo.getAttribute("aMag") as THREE.BufferAttribute;
      this.planets ??= PLANETS.map((name) => ({ name, dir: [0, 0, 1], magnitude: 99 }));
      for (const p of this.planets) p.magnitude = 99; // planets left out stay hidden
      for (const p of planets) {
        const slot = this.planets[PLANETS.indexOf(p.name)]!;
        slot.dir = unitVector(p.ra, p.dec);
        slot.magnitude = p.magnitude;
      }
      this.planets.forEach((p, i) => {
        dirs.setXYZ(i, p.dir[0], p.dir[1], p.dir[2]);
        mags.setX(i, p.magnitude);
      });
      dirs.needsUpdate = true;
      mags.needsUpdate = true;
    }
    this.planetPoints.visible = this.layers.planets && !!this.planets;
    this.dirty = true;
  }

  /**
   * Apparent paths of all the planets (the "all paths" layer, off by default: see
   * setPathsVisible). Marks are drawn but not dated: dates belong to the selected path.
   * Call it only when the paths change (the caller's cache returns the same object meanwhile).
   */
  setPaths(paths: SkyPath[] | null): void {
    const total = fillPathBuffers(this.pathPoints, paths ?? []);
    this.pathPoints.visible = this.layers.allPaths && total > 0;
    this.dirty = true;
  }

  /** Path of the selected planet, with a dated label at each mark (null: nothing selected). */
  setSelectedPath(path: SkyPath | null): void {
    this.pathMarks = [];
    const total = fillPathBuffers(this.selectedPathPoints, path ? [path] : []);
    const format = this.options.formatPathMark;
    if (path && format) {
      for (const pt of path.points)
        if (pt.mark)
          this.pathMarks.push({ dir: unitVector(pt.ra, pt.dec), text: format(pt.date), width: -1 });
    }
    this.selectedPathPoints.visible = this.layers.planets && total > 0;
    this.dirty = true;
  }

  /**
   * Highlights a constellation's figure (stronger 1-bit stroke, other figures dimmed) and its
   * name; null clears it.
   */
  setSelectedConstellation(abbr: string | null): void {
    this.selectedConstellation = abbr;
    this.uniforms.uLineOpacity.value = abbr ? 0.3 : 0.45;
    this.dirty = true;
  }

  /**
   * Screen rectangles (CSS px, overlay coordinates) covered by the interface (header, buttons,
   * time controls): no label is written there. Priority labels (cardinal points, Sun, Moon,
   * planets) try their fallback positions, then are hidden.
   */
  setHudExclusions(rects: readonly Rect[]): void {
    this.hudExclusions = rects.map((r) => ({ ...r }));
    this.dirty = true;
  }

  /** @deprecated Alias of setHudExclusions (which now applies to every label). */
  setGraduationExclusions(rects: readonly Rect[]): void {
    this.setHudExclusions(rects);
  }

  /** Switches layers on or off; keys left out keep their state. */
  setLayers(partial: Partial<SkyLayers>): void {
    for (const key of Object.keys(partial) as (keyof SkyLayers)[]) {
      const value = partial[key];
      if (typeof value === "boolean" && key in this.layers) this.layers[key] = value;
    }
    const l = this.layers;
    this.lineMesh.visible = l.constellationLines;
    this.planetPoints.visible = l.planets && !!this.planets;
    this.selectedPathPoints.visible =
      l.planets && this.selectedPathPoints.geometry.drawRange.count > 0;
    this.pathPoints.visible = l.allPaths && this.pathPoints.geometry.drawRange.count > 0;
    this.equatorialGrid.visible = l.equatorialGrid;
    this.azimuthalGrid.visible = l.azimuthalGrid;
    this.eclipticLine.visible = l.ecliptic;
    this.uniforms.uBelowAlpha.value = belowHorizonAlpha(l.seeThroughGround);
    this.ground.renderOrder = l.seeThroughGround ? -1 : 1;
    this.dirty = true;
  }

  getLayers(): Readonly<SkyLayers> {
    return this.layers;
  }

  /** Alias of setLayers({ planets }). */
  setPlanetsVisible(visible: boolean): void {
    this.setLayers({ planets: visible });
  }

  /** Alias of setLayers({ allPaths }): every planet's path, undated. */
  setPathsVisible(visible: boolean): void {
    this.setLayers({ allPaths: visible });
  }

  /** Alias of setLayers({ constellationLines, constellationNames }). */
  setLinesVisible(visible: boolean): void {
    this.setLayers({ constellationLines: visible, constellationNames: visible });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  // --- internals

  private updateSky(): void {
    this.eq2hor = j2000ToHorizontalMatrix(this.date, this.observer);
    this.uniforms.uEq2Hor.value = toThreeMat3(this.eq2hor);
    this.date2hor = equatorialToHorizontalMatrix(this.date, this.observer);
    this.frameOf(this.equatorialGrid).set(...this.date2hor);
    this.frameOf(this.eclipticLine).set(...this.eq2hor);
    this.updateDaylight();
    this.dirty = true;
  }

  private frameOf(lines: THREE.LineSegments): THREE.Matrix3 {
    return (lines.material as THREE.ShaderMaterial).uniforms.uFrame!.value as THREE.Matrix3;
  }

  /** Twilight model: stars fade out between astronomical twilight (−18°) and sunrise. */
  private updateDaylight(): void {
    const sunAltitude = this.bodies
      ? (Math.asin(applyMat3(this.eq2hor, this.bodies.sun)[2]) * 180) / Math.PI
      : -90;
    this.sunAltitude = sunAltitude;
    const k = Math.min(1, Math.max(0, (sunAltitude + 18) / 18));
    this.daylight = k * k;
    // Blend in sRGB (THREE.Color.lerp works in linear space and washes the blues out).
    const night = new THREE.Color(this.options.theme.sky).getRGB(
      new THREE.Color(),
      THREE.SRGBColorSpace,
    );
    const day = new THREE.Color(this.options.theme.daySky).getRGB(
      new THREE.Color(),
      THREE.SRGBColorSpace,
    );
    const t = this.daylight;
    this.renderer.setClearColor(
      new THREE.Color().setRGB(
        night.r + (day.r - night.r) * t,
        night.g + (day.g - night.g) * t,
        night.b + (day.b - night.b) * t,
        THREE.SRGBColorSpace,
      ),
    );
  }

  private clampView(): void {
    this.view.altitude = Math.max(-89.9, Math.min(89.9, this.view.altitude));
    this.view.azimuth = ((this.view.azimuth % 360) + 360) % 360;
    this.view.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, this.view.fov));
  }

  private resize(): void {
    const { canvas, overlay } = this.options;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fontKey = ""; // resizing the canvas resets its context state
    this.uniforms.uAspect.value = w / h;
    this.dirty = true;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (
      !this.pointers.size &&
      (Math.abs(this.velocity.az) > 0.001 || Math.abs(this.velocity.alt) > 0.001)
    ) {
      this.view.azimuth += this.velocity.az;
      this.view.altitude += this.velocity.alt;
      this.velocity.az *= FRICTION;
      this.velocity.alt *= FRICTION;
      this.clampView();
      this.dirty = true;
    }
    if (this.animation) {
      const { from, to, start, duration } = this.animation;
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = 1 - (1 - t) ** 3; // ease-out cubic
      this.view.azimuth = from.azimuth + (to.azimuth - from.azimuth) * e;
      this.view.altitude = from.altitude + (to.altitude - from.altitude) * e;
      this.view.fov = from.fov + (to.fov - from.fov) * e;
      if (t >= 1) this.animation = null;
      this.clampView();
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
      this.options.onViewChange?.(this.view);
    }
  };

  /** Combined J2000 → view matrix, for CPU-side projection (labels, picking). */
  private eqToView(): Mat3 {
    return multiplyMat3(viewMatrix(this.view), this.eq2hor);
  }

  private render(): void {
    const view = viewMatrix(this.view);
    this.uniforms.uView.value = toThreeMat3(view);
    this.uniforms.uViewInv.value = toThreeMat3(transpose(view));
    this.uniforms.uScale.value = stereoScale(this.view.fov);
    // Daylight drowns the stars: at noon only magnitude ≲ −1 objects would remain.
    this.uniforms.uLimitMag.value = limitingMagnitude(this.view.fov) - this.daylight * 7;
    this.uniforms.uPlanetLimit.value = planetLimitingMagnitude(
      this.uniforms.uLimitMag.value,
      this.sunAltitude,
    );
    const below = belowHorizonLimits(this.view.fov);
    this.uniforms.uLimitMagBelow.value = below.stars;
    this.uniforms.uPlanetLimitBelow.value = below.planets;
    if (this.bodies) {
      // Apparent size: real diameter (~0.53°) when zoomed in, a readable symbol otherwise.
      const pxPerDeg = this.options.canvas.clientHeight / this.view.fov;
      this.uniforms.uBodySize.value = Math.max(30, 0.53 * pxPerDeg * 1.1);
      // Direction of the Sun as seen from the Moon, in screen space (lights the crescent).
      const m = this.eqToView();
      const moon = this.bodies.moon;
      const sun = this.bodies.sun;
      const dot = moon[0] * sun[0] + moon[1] * sun[1] + moon[2] * sun[2];
      const tangent: Vec3 = [
        sun[0] - dot * moon[0],
        sun[1] - dot * moon[1],
        sun[2] - dot * moon[2],
      ];
      const [tx, ty] = applyMat3(m, tangent);
      this.uniforms.uSunAngle.value = Math.atan2(ty, tx);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  private toScreen(v: Vec3): [number, number] | null {
    if (v[2] < -0.5) return null; // wide fields of view reach ~120° from the centre
    const { w, h } = this.size;
    const [nx, ny] = projectStereo(v, stereoScale(this.view.fov), w / h);
    if (Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return null;
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h];
  }

  private drawLabels(): void {
    const { ctx } = this;
    const { canvas, stars, cardinals, theme } = this.options;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    this.drawSelectedFigure();
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = "middle";
    const m = this.eqToView();
    const view = viewMatrix(this.view);
    const isBelow = (d: Vec3) => applyMat3(this.eq2hor, d)[2] <= 0;
    // Labels below the horizon (seeThroughGround) come in a second, dimmed pass (#65).
    const passes = horizonPasses(this.layers.seeThroughGround);
    // Labels are placed by priority; a label that collides with every fallback is dropped.
    // None goes under the HUD, nor is cut by the top or bottom edge (a fallback above the
    // header would otherwise show only half its letters).
    const { clientWidth: width, clientHeight: height } = canvas;
    const layout = new LabelLayout([
      ...this.hudExclusions,
      { x: -width, y: -100, w: 3 * width, h: 100 },
      { x: -width, y: height, w: 3 * width, h: 100 },
    ]);
    const H = 12;

    // 1. Cardinal points on the horizon
    if (cardinals) {
      this.setLabelFont("700 13px", "0.1em", 0.9);
      cardinals.forEach((label, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const p = this.toScreen(applyMat3(view, [Math.cos(a), Math.sin(a), 0]));
        if (!p) return;
        const w = this.measure(label);
        const r = layout.place([
          { x: p[0] - w / 2, y: p[1] + 16 - H / 2, w, h: H }, // below the horizon
          { x: p[0] - w / 2, y: p[1] - 16 - H / 2, w, h: H }, // above it
        ]);
        if (r) ctx.fillText(label, r.x, r.y + H / 2);
      });
    }

    this.constellationLabelRects = [];
    for (const below of passes) {
      // 2. Sun and Moon
      if (this.bodies && this.options.bodyNames) {
        this.setLabelFont("700 11px", "0.12em", labelAlpha(0.95, below));
        const offset = this.uniforms.uBodySize.value / 2 + 6;
        for (const [body, dir] of [
          ["Sun", this.bodies.sun],
          ["Moon", this.bodies.moon],
        ] as const) {
          if (isBelow(dir) !== below) continue;
          const p = this.toScreen(applyMat3(m, dir));
          if (!p) continue;
          // The disc itself is occupied: later labels (path dates…) must not cover it.
          const half = offset - 6;
          layout.occupy({ x: p[0] - half, y: p[1] - half, w: 2 * half, h: 2 * half });
          const label = this.options.bodyNames[body].toUpperCase();
          const w = this.measure(label);
          const r = layout.place([
            { x: p[0] + offset, y: p[1] - H / 2, w, h: H },
            { x: p[0] - offset - w, y: p[1] - H / 2, w, h: H },
            { x: p[0] - w / 2, y: p[1] - offset - H, w, h: H },
            { x: p[0] - w / 2, y: p[1] + offset, w, h: H },
          ]);
          if (r) ctx.fillText(label, r.x, r.y + H / 2);
        }
      }

      // 3. Planets (those daylight leaves visible)
      if (this.layers.planets && this.planets && this.options.planetNames) {
        this.setLabelFont("700 10px", "0.12em", labelAlpha(0.9, below));
        for (const p of this.planets) {
          if (isBelow(p.dir) !== below || !this.planetVisible(p.magnitude, below)) continue;
          const pos = this.toScreen(applyMat3(m, p.dir));
          if (!pos) continue;
          const label = this.options.planetNames[p.name].toUpperCase();
          const w = this.measure(label);
          const off = planetRadius(p) + 5;
          const [x, y] = pos;
          layout.occupy({ x: x - off + 5, y: y - off + 5, w: 2 * off - 10, h: 2 * off - 10 });
          const r = layout.place([
            { x: x + off, y: y - H / 2, w, h: H },
            { x: x - off - w, y: y - H / 2, w, h: H },
            { x: x - w / 2, y: y - off - H, w, h: H },
            { x: x - w / 2, y: y + off, w, h: H },
          ]);
          if (r) ctx.fillText(label, r.x, r.y + H / 2);
        }
      }

      // 4. Star names, brightest first (the catalogue is sorted by magnitude)
      // Never name a star that daylight hides.
      const visibleLimit =
        (below ? this.uniforms.uLimitMagBelow.value : this.uniforms.uLimitMag.value) - 1;
      const maxMag = Math.min(
        visibleLimit,
        this.view.fov > 90 ? 1.2 : this.view.fov > 45 ? 2.2 : 3.5,
      );
      this.setLabelFont("400 10px", "0.08em", labelAlpha(0.8, below));
      // Sorted catalogue: stop at the first star too faint to be named (a few dozen visited
      // instead of the whole catalogue, twice with seeThroughGround).
      for (let i = 0; this.layers.starNames && i < stars.length; i++) {
        const s = stars[i]!;
        if (s.v > maxMag) break;
        if (!s.name) continue;
        const d = this.starDirs[i]!;
        if (isBelow(d) !== below) continue;
        const p = this.toScreen(applyMat3(m, d));
        if (!p) continue;
        const w = this.measure(s.name);
        const [x, y] = p;
        const r = layout.place([
          { x: x + 9, y: y - H / 2, w, h: H }, // right
          { x: x - 9 - w, y: y - H / 2, w, h: H }, // left
          { x: x - w / 2, y: y - 8 - H, w, h: H }, // above
          { x: x - w / 2, y: y + 8, w, h: H }, // below
        ]);
        if (r) ctx.fillText(s.name, r.x, r.y + H / 2);
      }

      // 5. Constellation names (rectangles kept for picking; the selected one is brighter)
      if (this.layers.constellationNames) {
        this.setLabelFont("500 10px", "0.18em", labelAlpha(0.55, below));
        for (const { abbr, text, dir } of this.labels) {
          if (isBelow(dir) !== below) continue;
          const p = this.toScreen(applyMat3(m, dir));
          if (!p) continue;
          const label = text.toUpperCase();
          const w = this.measure(label);
          const [x, y] = p;
          const r = layout.place(
            [0, -16, 16, -32, 32].map((dy) => ({ x: x - w / 2, y: y + dy - H / 2, w, h: H })),
          );
          if (!r) continue;
          this.constellationLabelRects.push({ abbr, rect: r });
          ctx.globalAlpha = labelAlpha(abbr === this.selectedConstellation ? 1 : 0.55, below);
          ctx.fillText(label, r.x, r.y + H / 2);
        }
      }
      // 6. Dates of the monthly marks on the selected planet's path (lowest priority)
      if (this.selectedPathPoints.visible && this.pathMarks.length) {
        this.setLabelFont("400 9px", "0.06em", labelAlpha(0.6, below));
        const h = 10;
        for (const mark of this.pathMarks) {
          const { dir, text } = mark;
          if (isBelow(dir) !== below) continue;
          const p = this.toScreen(applyMat3(m, dir));
          if (!p) continue;
          if (mark.width < 0) mark.width = ctx.measureText(text).width; // measured once
          const w = mark.width;
          const [x, y] = p;
          const r = layout.place([
            { x: x + 6, y: y - h, w, h },
            { x: x - 6 - w, y: y - h, w, h },
            { x: x + 6, y, w, h },
            { x: x - 6 - w, y, w, h },
          ]);
          if (r) ctx.fillText(text, r.x, r.y + h / 2);
        }
      }
    }
    // 7. Graduations of the grids and of the ecliptic (lightest, last)
    if (this.layers.equatorialGrid || this.layers.azimuthalGrid || this.layers.ecliptic) {
      this.setLabelFont("400 9px", "0.06em", 0.55);
      this.labelView = view;
      const eqView = this.layers.equatorialGrid ? multiplyMat3(view, this.date2hor) : null;
      for (const below of passes) {
        this.graduationBelow = below;
        this.ctx.globalAlpha = labelAlpha(0.55, below);
        if (eqView) this.drawGridGraduations(layout, eqView, "ra", "dec");
        if (this.layers.azimuthalGrid && !below)
          this.drawGridGraduations(layout, view, "az", "alt");
        if (this.layers.ecliptic) this.drawEclipticGraduations(layout, m);
      }
    }
    if (this.pointing) this.drawReticle();
    ctx.globalAlpha = 1;
  }

  private graduation(kind: GraduationKind, value: number): string {
    const key = `${kind}${value}`;
    let text = this.graduationTexts.get(key);
    if (text === undefined) {
      text = (this.options.formatGraduation ?? formatGraduation)(kind, value);
      this.graduationTexts.set(key, text);
    }
    return text;
  }

  /**
   * Labels of a grid along the meridian and the parallel crossing nearest the view centre.
   * `toView` takes the grid's frame to view coordinates.
   */
  private drawGridGraduations(
    layout: LabelLayout,
    toView: Mat3,
    lonKind: GraduationKind,
    latKind: GraduationKind,
  ): void {
    const steps = labelSteps(this.view.fov);
    // View axis expressed in the grid's frame: third row of toView.
    const centre: Vec3 = [toView[6], toView[7], toView[8]];
    const at = graduationLines(centre, steps.lon, steps.lat);
    const minLat = lonKind === "az" ? 0 : -80;
    if (at.lat < minLat) at.lat = minLat;
    for (let lon = 0; lon < 360; lon += steps.lon)
      this.placeGraduation(layout, toView, spherical(lon, at.lat), this.graduation(lonKind, lon));
    for (let lat = minLat; lat <= 80; lat += steps.lat) {
      if (lat === at.lat) continue; // the crossing already carries a longitude label
      this.placeGraduation(layout, toView, spherical(at.lon, lat), this.graduation(latKind, lat));
    }
  }

  private drawEclipticGraduations(layout: LabelLayout, eqToView: Mat3): void {
    for (let lambda = 0; lambda < 360; lambda += 30) {
      const dir = eclipticOfDate(lambda, this.date);
      if (applyMat3(this.eq2hor, dir)[2] <= 0 !== this.graduationBelow) continue;
      this.placeGraduation(layout, eqToView, dir, this.graduation("ecliptic", lambda), true);
    }
  }

  /**
   * Writes a graduation next to a grid point, without overlaps: only points on the side of the
   * horizon of the current pass (graduationBelow).
   */
  private placeGraduation(
    layout: LabelLayout,
    toView: Mat3,
    dir: Vec3,
    text: string,
    below = false,
  ): void {
    const v = applyMat3(toView, dir);
    // Side of the horizon: back to horizontal with the transposed view matrix (third column).
    const view = this.labelView;
    const up = view[2] * v[0] + view[5] * v[1] + view[8] * v[2];
    if (up < 0 !== this.graduationBelow) return;
    const p = this.toScreen(v);
    if (!p) return;
    const w = this.measure(text);
    const h = 10;
    const [x, y] = p;
    const { w: width, h: height } = this.size;
    const candidates = below
      ? [
          { x: x + 4, y: y + 3, w, h },
          { x: x - 4 - w, y: y + 3, w, h },
        ]
      : [
          { x: x + 3, y: y - h - 1, w, h },
          { x: x + 3, y: y + 1, w, h },
        ];
    // Whole labels only: a clipped "Az 135°" would read "135°", the ambiguity prefixes remove.
    const r = layout.place(
      candidates.filter((c) => c.x >= 0 && c.y >= 0 && c.x + w <= width && c.y + h <= height),
    );
    if (r) this.ctx.fillText(text, r.x, r.y + h / 2);
  }

  private drawReticle(): void {
    const { ctx } = this;
    const { canvas, theme } = this.options;
    const [cx, cy] = [canvas.clientWidth / 2, canvas.clientHeight / 2];
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(cx + dx * 28, cy + dy * 28);
      ctx.lineTo(cx + dx * 40, cy + dy * 40);
    }
    ctx.stroke();
    const target = this.pick(cx, cy);
    if (target && this.options.describeTarget) {
      this.setLabelFont("700 12px", "0.12em", 1);
      ctx.fillStyle = theme.ink;
      const label = this.options.describeTarget(target).toUpperCase();
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy + 56);
    }
  }

  /** Same rule as planetVert (see planetLimitingMagnitude; night limit below the horizon). */
  private planetVisible(magnitude: number, below = false): boolean {
    const limit = below ? this.uniforms.uPlanetLimitBelow : this.uniforms.uPlanetLimit;
    return magnitude <= limit.value;
  }

  /**
   * Sets the label font. Assigning ctx.font / letterSpacing re-parses the font even when unchanged,
   * so the current one is remembered; text widths are cached per font (labels repeat every frame).
   */
  private setLabelFont(weightSize: string, spacing: string, alpha: number): void {
    const key = `${weightSize}|${spacing}`;
    if (key !== this.fontKey) {
      this.fontKey = key;
      this.ctx.font = `${weightSize} 'JetBrains Mono', monospace`;
      this.ctx.letterSpacing = spacing;
      let widths = this.textWidths.get(key);
      if (!widths) this.textWidths.set(key, (widths = new Map()));
      this.widths = widths;
    }
    this.ctx.textAlign = "left";
    this.ctx.globalAlpha = alpha;
  }

  /** Width of a label in the current label font (cached). */
  private measure(text: string): number {
    let w = this.widths.get(text);
    if (w === undefined) this.widths.set(text, (w = this.ctx.measureText(text).width));
    return w;
  }

  /** Projects a view-frame direction without the screen bounds check of toScreen (for lines). */
  private toScreenUnclipped(v: Vec3): Point | null {
    if (v[2] < -0.5) return null;
    const { w, h } = this.size;
    const [nx, ny] = projectStereo(v, stereoScale(this.view.fov), w / h);
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h];
  }

  /**
   * Figure segments on screen, cut at the horizon (horizontal z = 0). The parts below it are kept
   * only with seeThroughGround, after the others (from index `belowFrom`). `only` restricts the
   * work to one constellation.
   */
  private projectFigures(only?: string): (FigureShape & { belowFrom: number })[] {
    const view = viewMatrix(this.view);
    const seeThrough = this.layers.seeThroughGround;
    const shapes: (FigureShape & { belowFrom: number })[] = [];
    const project = (ha: Vec3, hb: Vec3, out: [Point, Point][]) => {
      const pa = this.toScreenUnclipped(applyMat3(view, ha));
      const pb = this.toScreenUnclipped(applyMat3(view, hb));
      if (pa && pb) out.push([pa, pb]);
    };
    for (const { abbr, segments } of this.figures) {
      if (only && abbr !== only) continue;
      const above: [Point, Point][] = [];
      const below: [Point, Point][] = [];
      for (const [a, b] of segments) {
        const ha = applyMat3(this.eq2hor, a);
        const hb = applyMat3(this.eq2hor, b);
        if (ha[2] > 0 && hb[2] > 0) project(ha, hb, above);
        else if (ha[2] <= 0 && hb[2] <= 0) {
          if (seeThrough) project(ha, hb, below);
        } else {
          const t = ha[2] / (ha[2] - hb[2]);
          const cut: Vec3 = [ha[0] + (hb[0] - ha[0]) * t, ha[1] + (hb[1] - ha[1]) * t, 0];
          const [up, down] = ha[2] > 0 ? [ha, hb] : [hb, ha];
          project(up, cut, above);
          if (seeThrough) project(cut, down, below);
        }
      }
      if (above.length + below.length)
        shapes.push({ abbr, segments: [...above, ...below], belowFrom: above.length });
    }
    return shapes;
  }

  /** The selected figure as an engraved stroke: a 1-bit checkerboard band around a solid core. */
  private drawSelectedFigure(): void {
    const abbr = this.selectedConstellation;
    if (!abbr || !this.layers.constellationLines) return;
    const [shape] = this.projectFigures(abbr);
    if (!shape) return;
    const { ctx } = this;
    const ink = this.options.theme.ink;
    if (this.figurePattern?.ink !== ink) {
      const tile = document.createElement("canvas");
      tile.width = tile.height = 2;
      const t = tile.getContext("2d")!;
      t.fillStyle = ink;
      t.fillRect(0, 0, 1, 1);
      t.fillRect(1, 1, 1, 1);
      this.figurePattern = { ink, pattern: ctx.createPattern(tile, "repeat") };
    }
    ctx.save();
    ctx.lineCap = "round";
    // Above the horizon, then (seeThroughGround) the dimmed part below it.
    const parts = [
      [0, shape.belowFrom, false],
      [shape.belowFrom, shape.segments.length, true],
    ] as const;
    for (const [from, to, below] of parts) {
      if (from === to) continue;
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const [a, b] = shape.segments[i]!;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.globalAlpha = labelAlpha(0.8, below);
      ctx.lineWidth = 5;
      ctx.strokeStyle = this.figurePattern.pattern ?? ink;
      ctx.stroke();
      ctx.globalAlpha = labelAlpha(1, below);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    ctx.restore();
  }

  private pick(x: number, y: number): SkySelection | null {
    // A constellation name is an explicit target: it wins over the stars around it.
    const label = pickLabel([x, y], this.constellationLabelRects);
    if (label) return { kind: "constellation", abbr: label };
    const m = this.eqToView();
    // Below the horizon, only what seeThroughGround shows can be picked (night limits there).
    const seeThrough = this.layers.seeThroughGround;
    if (this.bodies) {
      const radius = Math.max(22, this.uniforms.uBodySize.value / 2);
      for (const [body, dir] of [
        ["Moon", this.bodies.moon],
        ["Sun", this.bodies.sun],
      ] as const) {
        if (applyMat3(this.eq2hor, dir)[2] < 0 && !seeThrough) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (p && Math.hypot(p[0] - x, p[1] - y) < radius) return { kind: "body", body };
      }
    }
    if (this.layers.planets && this.planets) {
      let found: Planet | null = null;
      let bestDist = Infinity;
      for (const pl of this.planets) {
        const below = applyMat3(this.eq2hor, pl.dir)[2] < 0;
        if ((below && !seeThrough) || !this.planetVisible(pl.magnitude, below)) continue;
        const p = this.toScreen(applyMat3(m, pl.dir));
        if (!p) continue;
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < Math.max(20, planetRadius(pl) + 8) && d < bestDist)
          [found, bestDist] = [pl.name, d];
      }
      if (found) return { kind: "planet", planet: found };
    }
    const limit = limitingMagnitude(this.view.fov);
    let best: CatalogStar | null = null;
    let bestScore = 26;
    this.options.stars.forEach((s, i) => {
      if (s.v > limit) return;
      const dir = this.starDirs[i]!;
      if (!seeThrough && applyMat3(this.eq2hor, dir)[2] <= 0) return;
      const p = this.toScreen(applyMat3(m, dir));
      if (!p) return;
      const score = Math.hypot(p[0] - x, p[1] - y) - (limit - s.v) * 1.5;
      if (score < bestScore) [best, bestScore] = [s, score];
    });
    if (best) return { kind: "star", star: best };
    // No star or body nearby: the figure the tap falls in, if any.
    if (!this.layers.constellationLines) return null;
    const abbr = pickFigure([x, y], this.projectFigures());
    return abbr ? { kind: "constellation", abbr } : null;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    let pinchDist = 0;

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.velocity = { az: 0, alt: 0 };
      this.moved = 0;
      if (this.pointers.size === 2) pinchDist = this.pinchDistance();
    });

    canvas.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved += Math.abs(dx) + Math.abs(dy);

      if (this.pointers.size === 1 && this.pointing) {
        this.options.onPointingDrag?.((-dx * this.view.fov) / canvas.clientHeight);
      } else if (this.pointers.size === 1) {
        this.animation = null;
        const degPerPx = this.view.fov / canvas.clientHeight;
        this.velocity = { az: -dx * degPerPx, alt: dy * degPerPx };
        this.view.azimuth += this.velocity.az;
        this.view.altitude += this.velocity.alt;
      } else if (this.pointers.size === 2) {
        const d = this.pinchDistance();
        if (pinchDist > 0) this.view.fov *= pinchDist / d;
        pinchDist = d;
      }
      this.clampView();
      this.dirty = true;
    });

    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0 && this.moved < 6) {
        const rect = canvas.getBoundingClientRect();
        this.options.onSelect?.(this.pick(e.clientX - rect.left, e.clientY - rect.top));
      }
      pinchDist = 0;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.view.fov *= Math.exp(e.deltaY * 0.0012);
        this.clampView();
        this.dirty = true;
      },
      { passive: false },
    );
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
