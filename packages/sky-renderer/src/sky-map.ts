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
 *   miniGlobe,       // #38: small Earth in a corner of the sky view (drawn by the app)
 *   realisticDaylight, // #106: daylight hides the stars (off: drawn as at night; daylight.ts)
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
  propagateDirections,
  starMotion,
  unitVector,
  yearsSinceHipparcos,
  type Mat3,
  type StarMotion,
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
import { dayInkAlpha, daylightFactor, daylightStarLimit, physicalStarLimit } from "./daylight";
import { belowHorizonAlpha, belowHorizonLimits, horizonPasses, labelAlpha } from "./see-through";
import { eclipticCircle, eclipticOfDate, graduationLines, spherical, sphericalGrid } from "./grids";
import {
  backCutoff,
  maxFov,
  projectStereo,
  stereoScale,
  unprojectStereo,
  viewMatrix,
  type ViewState,
} from "./view";
import {
  AimThrottle,
  STAR_BRIGHTNESS_BONUS,
  STAR_OVER_LABEL_RADIUS,
  STAR_PICK_RADIUS,
  boundingCap,
  coneAngle,
  inCap,
  pickStar,
  starPickLimit,
  type Cap,
} from "./pick";
import { ephemerisReliable } from "./ephemeris-range";
import { disposeObjects, watchContext } from "./lifecycle";
import {
  MARKER_GAP,
  STAR_MARKER_RADIUS,
  arrivalProgress,
  drawArrival,
  drawMarker,
  figureStarRadius,
  inkPattern,
  selectionDim,
} from "./highlight";

export interface CatalogStar {
  hip: number;
  ra: number;
  dec: number;
  v: number;
  bv?: number;
  plx?: number;
  /** Standard error of the parallax (mas), when the catalogue gives it. */
  ePlx?: number;
  /** Proper motion μα* = μα·cosδ and μδ (mas/yr); positions are at epoch J1991.25. */
  pmRa?: number;
  pmDec?: number;
  /** Radial velocity (km/s, positive receding): perspective acceleration in aPm (#79). */
  radialVelocity?: number;
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
  /** Mini-globe in a corner of the sky view (#38): drawn by the app (MiniGlobe), not the map. */
  miniGlobe: boolean;
  /**
   * Realistic daytime sky (#106): daylight hides the stars and their names (#34). Off (default):
   * by day they stay drawn as at night, with a stronger ink (see daylight.ts).
   */
  realisticDaylight: boolean;
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
  miniGlobe: true,
  realisticDaylight: false,
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
  /**
   * Star directions (J2000 frame) at the current date: catalogue positions moved by their proper
   * motion (#78). Updated in place by updateProperMotion, so the figures' segments, the label
   * anchors and picking (which hold these very arrays) follow the stars.
   */
  private readonly starDirs: Vec3[];
  /** Epoch (J1991.25) directions and proper-motion vectors, the shaders' aDir / aPm. */
  private readonly motion: StarMotion;
  /** Years since J1991.25 the CPU directions and uYears were last computed for. */
  private motionYears = NaN;
  private readonly labels: { abbr: string; text: string; dir: Vec3; stars: Vec3[] }[];
  /** Constellation figures as J2000 segments, for highlighting and picking (#61). */
  private readonly figures: {
    abbr: string;
    segments: [Vec3, Vec3][];
    stars: Vec3[];
    /** Catalogue indices of the figure's stars (enlarged when it is selected, #103). */
    starIndices: number[];
    cap: Cap;
  }[] = [];
  private selectedConstellation: string | null = null;
  /** Catalogue index of each HIP number (selection marker, #103). */
  private readonly hipIndex: Map<number, number>;
  /** Selected star, Sun, Moon or planet, marked by an engraved reticle (#103). */
  private marked:
    | { kind: "star"; index: number }
    | { kind: "body"; body: BodyName }
    | { kind: "planet"; planet: Planet }
    | null = null;
  /**
   * Arrival animation of the marker (#103): pending until the view animation ends, then runs
   * ARRIVAL_MS from `start`.
   */
  private arrival: { pending: boolean; start: number } | null = null;
  /** Opacity of the veil over the rest of the sky (a constellation is selected), see highlight.ts. */
  private dim = 0;
  /** Current sky colour (CSS), for the veil. */
  private skyColor = "#000";
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
  private running = false;
  /** The WebGL context is lost: nothing is drawn until it is restored. */
  private contextLost = false;
  /** Removes every listener added by the map (input, fonts, context) on dispose. */
  private readonly listeners = new AbortController();
  /** Moon and planet positions are within the validated range (see ephemeris-range.ts). */
  private ephemerisOk = true;
  /** Reticle target's label (sensor pointing), recomputed under aimThrottle only. */
  private aimLabel = "";
  private readonly aimThrottle = new AimThrottle();
  /** A frame reused a cached target: one more frame is due once the throttle allows it. */
  private aimStale = false;
  /** Scratch screen point of toScreen (no allocation per projected point). */
  private readonly screenPt: [number, number] = [0, 0];
  /** Magnitudes of the catalogue (sorted), for pickStar. */
  private readonly mags: Float32Array;
  private velocity = { az: 0, alt: 0 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private readonly resizeObserver: ResizeObserver;
  /** Canvas size in CSS px, kept by resize(): read for every projected label, it avoids layout reads. */
  private size = { w: 1, h: 1 };
  private readonly backZCache = { fov: NaN, aspect: NaN, z: -0.6 };

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
      uBackZ: { value: -0.6 },
      uDpr: { value: this.renderer.getPixelRatio() },
      uLimitMag: { value: 5 },
      uPlanetLimit: { value: 9 },
      uLimitMagBelow: { value: 5 },
      uPlanetLimitBelow: { value: 9 },
      uBelowAlpha: { value: 0 },
      uInk: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uLineOpacity: { value: 0.45 },
      uFigures: { value: 1 },
      uHalfHeight: { value: 1 },
      uBodySize: { value: 32 },
      uMoonT: { value: 0 },
      uSunAngle: { value: 0 },
      uYears: { value: 0 },
    };

    this.motion = starMotion(stars);
    this.starDirs = stars.map((): Vec3 => [0, 0, 0]);
    this.mags = Float32Array.from(stars, (s) => s.v);
    const indexOf = new Map(stars.map((s, i) => [s.hip, i]));
    this.hipIndex = indexOf;
    const byHip = new Map(stars.map((s, i) => [s.hip, this.starDirs[i]!]));

    // Stars: epoch direction + proper motion, moved by the shader (aDir + uYears · aPm)
    const starGeo = new THREE.BufferGeometry();
    const epochDirs = new THREE.BufferAttribute(this.motion.dirs, 3);
    starGeo.setAttribute("position", epochDirs);
    starGeo.setAttribute("aDir", epochDirs);
    starGeo.setAttribute("aPm", new THREE.BufferAttribute(this.motion.pm, 3));
    starGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(
        stars.map((s) => s.v),
        1,
      ),
    );
    const starPoints = new THREE.Points(starGeo, this.material(starVert, starFrag, true));
    starPoints.frustumCulled = false;

    // Constellation lines: each end follows its star (same aDir / aPm as the star). Each vertex
    // also carries the other end and both magnitudes: the shader stops the line short of the
    // stars (#104).
    const segs: number[] = [];
    const segPm: number[] = [];
    const segOther: number[] = [];
    const segOtherPm: number[] = [];
    const segMag: number[] = [];
    const segOtherMag: number[] = [];
    const segEnd: number[] = [];
    const member = new Float32Array(stars.length);
    const { dirs: d0, pm } = this.motion;
    for (const [abbr, polys] of Object.entries(lines)) {
      const figure: [Vec3, Vec3][] = [];
      const figureStars = new Set<Vec3>();
      const starIndices = new Set<number>();
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const ia = indexOf.get(poly[i]!);
          const ib = indexOf.get(poly[i + 1]!);
          if (ia === undefined || ib === undefined) continue;
          for (const [end, j, k] of [
            [0, ia, ib],
            [1, ib, ia],
          ] as const) {
            segs.push(d0[3 * j]!, d0[3 * j + 1]!, d0[3 * j + 2]!);
            segPm.push(pm[3 * j]!, pm[3 * j + 1]!, pm[3 * j + 2]!);
            segOther.push(d0[3 * k]!, d0[3 * k + 1]!, d0[3 * k + 2]!);
            segOtherPm.push(pm[3 * k]!, pm[3 * k + 1]!, pm[3 * k + 2]!);
            segMag.push(stars[j]!.v);
            segOtherMag.push(stars[k]!.v);
            segEnd.push(end);
            member[j] = 1;
          }
          const a = this.starDirs[ia]!;
          const b = this.starDirs[ib]!;
          figure.push([a, b]);
          figureStars.add(a).add(b);
          starIndices.add(ia).add(ib);
        }
      }
      const cap: Cap = { centre: [0, 0, 0], cosRadius: -1 };
      this.figures.push({
        abbr,
        segments: figure,
        stars: [...figureStars],
        starIndices: [...starIndices],
        cap,
      });
    }
    const lineGeo = new THREE.BufferGeometry();
    const segDirs = new THREE.Float32BufferAttribute(segs, 3);
    lineGeo.setAttribute("position", segDirs);
    lineGeo.setAttribute("aDir", segDirs);
    lineGeo.setAttribute("aPm", new THREE.Float32BufferAttribute(segPm, 3));
    lineGeo.setAttribute("aOther", new THREE.Float32BufferAttribute(segOther, 3));
    lineGeo.setAttribute("aOtherPm", new THREE.Float32BufferAttribute(segOtherPm, 3));
    lineGeo.setAttribute("aMag", new THREE.Float32BufferAttribute(segMag, 1));
    lineGeo.setAttribute("aOtherMag", new THREE.Float32BufferAttribute(segOtherMag, 1));
    lineGeo.setAttribute("aEnd", new THREE.Float32BufferAttribute(segEnd, 1));
    // Stars drawing a figure are reinforced while the lines are shown (uFigures).
    starGeo.setAttribute("aMember", new THREE.BufferAttribute(member, 1));
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

    // Constellation labels at the normalized centroid of their line stars (each polyline vertex
    // counts, as before #78; updated with the proper motion by updateProperMotion)
    this.labels = Object.entries(lines).map(([abbr, polys]) => ({
      abbr,
      text: options.constellationNames?.[abbr] ?? abbr,
      dir: [0, 0, 1],
      stars: polys
        .flat()
        .map((h) => byHip.get(h))
        .filter((d): d is Vec3 => !!d),
    }));

    this.setLayers(options.layers ?? {});
    this.setTheme(options.theme);
    // Widths measured before the web font finished loading are wrong: measure again.
    const signal = this.listeners.signal;
    document.fonts?.addEventListener(
      "loadingdone",
      () => {
        this.textWidths.clear();
        this.fontKey = "";
        for (const m of this.pathMarks) m.width = -1;
        this.dirty = true;
      },
      { signal },
    );
    watchContext(canvas, signal, {
      lost: () => (this.contextLost = true),
      restored: () => {
        this.contextLost = false;
        this.dirty = true;
      },
    });
    this.bindInput(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.updateSky();
    this.start();
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
    this.aimThrottle.reset();
    this.aimLabel = "";
    this.aimStale = false;
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
    this.updateVisibility();
  }

  /**
   * Apparent paths of all the planets (the "all paths" layer, off by default: see
   * setPathsVisible). Marks are drawn but not dated: dates belong to the selected path.
   * Call it only when the paths change (the caller's cache returns the same object meanwhile).
   */
  setPaths(paths: SkyPath[] | null): void {
    fillPathBuffers(this.pathPoints, paths ?? []);
    this.updateVisibility();
  }

  /** Path of the selected planet, with a dated label at each mark (null: nothing selected). */
  setSelectedPath(path: SkyPath | null): void {
    this.pathMarks = [];
    fillPathBuffers(this.selectedPathPoints, path ? [path] : []);
    const format = this.options.formatPathMark;
    if (path && format) {
      for (const pt of path.points)
        if (pt.mark)
          this.pathMarks.push({ dir: unitVector(pt.ra, pt.dec), text: format(pt.date), width: -1 });
    }
    this.updateVisibility();
  }

  /**
   * Highlights a constellation's figure (stronger 1-bit stroke, other figures dimmed) and its
   * name; null clears it.
   */
  setSelectedConstellation(abbr: string | null): void {
    this.selectedConstellation = abbr;
    this.uniforms.uLineOpacity.value = abbr ? 0.3 : 0.45;
    this.dim = selectionDim(abbr ? "constellation" : null);
    this.dirty = true;
  }

  /**
   * Highlights the selected object (#103): an engraved reticle around a star, planet, Sun or
   * Moon; for a constellation, setSelectedConstellation (figure, stars and name stronger, the
   * rest of the sky dimmed). null clears it (and stops an arrival animation).
   */
  setSelection(selection: SkySelection | null): void {
    this.setSelectedConstellation(selection?.kind === "constellation" ? selection.abbr : null);
    if (selection?.kind === "star") {
      const index = this.hipIndex.get(selection.star.hip);
      this.marked = index === undefined ? null : { kind: "star", index };
    } else if (selection?.kind === "body") this.marked = { kind: "body", body: selection.body };
    else if (selection?.kind === "planet")
      this.marked = { kind: "planet", planet: selection.planet };
    else this.marked = null;
    if (!this.marked) this.arrival = null;
  }

  /**
   * Plays the marker's arrival animation (converging rings, ARRIVAL_MS) once the view has
   * finished turning (animateTo), e.g. after a search. The render loop runs only during it.
   * Not called with prefers-reduced-motion: the marker is then static.
   */
  playArrival(): void {
    if (!this.marked) return;
    this.arrival = { pending: true, start: NaN };
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
    this.updateVisibility();
  }

  /** Visibility of every layer, from the layers, the data given and the date. */
  private updateVisibility(): void {
    const l = this.layers;
    // Moon and planets only within the validated ephemeris range (see ephemeris-range.ts).
    const planets = l.planets && this.ephemerisOk;
    this.lineMesh.visible = l.constellationLines;
    this.uniforms.uFigures.value = l.constellationLines ? 1 : 0;
    this.planetPoints.visible = planets && !!this.planets;
    this.selectedPathPoints.visible =
      planets && this.selectedPathPoints.geometry.drawRange.count > 0;
    this.pathPoints.visible =
      l.allPaths && this.ephemerisOk && this.pathPoints.geometry.drawRange.count > 0;
    // Sun = point 0, Moon = point 1.
    this.bodyPoints.geometry.setDrawRange(0, this.ephemerisOk ? 2 : 1);
    this.equatorialGrid.visible = l.equatorialGrid;
    this.azimuthalGrid.visible = l.azimuthalGrid;
    this.eclipticLine.visible = l.ecliptic;
    this.uniforms.uBelowAlpha.value = belowHorizonAlpha(l.seeThroughGround);
    this.ground.renderOrder = l.seeThroughGround ? -1 : 1;
    this.dirty = true;
  }

  /** Planets are drawn (layer on, data given, date within the ephemeris range). */
  private planetsShown(): boolean {
    return this.layers.planets && this.ephemerisOk && !!this.planets;
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

  /** Starts the render loop (on by default); see stop(). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.dirty = true;
    this.loop();
  }

  /**
   * Stops the render loop while the map is hidden (Earth view): date and view changes are kept
   * and drawn on start().
   */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Stops the loop and frees listeners, geometries, materials, textures and the renderer. */
  dispose(): void {
    this.stop();
    this.listeners.abort();
    this.resizeObserver.disconnect();
    disposeObjects(this.scene);
    this.renderer.dispose();
  }

  // --- internals

  private updateSky(): void {
    this.updateProperMotion();
    this.eq2hor = j2000ToHorizontalMatrix(this.date, this.observer);
    this.uniforms.uEq2Hor.value = toThreeMat3(this.eq2hor);
    this.date2hor = equatorialToHorizontalMatrix(this.date, this.observer);
    this.frameOf(this.equatorialGrid).set(...this.date2hor);
    this.frameOf(this.eclipticLine).set(...this.eq2hor);
    this.updateDaylight();
    const ok = ephemerisReliable(this.date);
    if (ok !== this.ephemerisOk) {
      this.ephemerisOk = ok;
      this.updateVisibility();
    }
    this.dirty = true;
  }

  /**
   * Moves the CPU copies of the stars (picking, labels, figures, name anchors) to the date, and
   * sets the shaders' uYears to the same instant. Skipped below 1/1000 year (the fastest
   * catalogue star then moves < 0.01″); allocation-free.
   */
  private updateProperMotion(): void {
    const years = yearsSinceHipparcos(this.date);
    if (Math.abs(years - this.motionYears) < 1e-3) return;
    this.motionYears = years;
    this.uniforms.uYears.value = years;
    propagateDirections(this.motion, years, this.starDirs);
    for (const f of this.figures) boundingCap(f.stars, f.cap);
    for (const label of this.labels) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const d of label.stars) {
        x += d[0];
        y += d[1];
        z += d[2];
      }
      const n = Math.hypot(x, y, z) || 1;
      label.dir[0] = x / n;
      label.dir[1] = y / n;
      label.dir[2] = z / n;
    }
  }

  private frameOf(lines: THREE.LineSegments): THREE.Matrix3 {
    return (lines.material as THREE.ShaderMaterial).uniforms.uFrame!.value as THREE.Matrix3;
  }

  /** Twilight model: the sky brightens between astronomical twilight (−18°) and sunrise. */
  private updateDaylight(): void {
    const sunAltitude = this.bodies
      ? (Math.asin(applyMat3(this.eq2hor, this.bodies.sun)[2]) * 180) / Math.PI
      : -90;
    this.sunAltitude = sunAltitude;
    this.daylight = daylightFactor(sunAltitude);
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
    const sky = new THREE.Color().setRGB(
      night.r + (day.r - night.r) * t,
      night.g + (day.g - night.g) * t,
      night.b + (day.b - night.b) * t,
      THREE.SRGBColorSpace,
    );
    this.renderer.setClearColor(sky);
    this.skyColor = `#${sky.getHexString(THREE.SRGBColorSpace)}`;
  }

  private clampView(): void {
    this.view.altitude = Math.max(-89.9, Math.min(89.9, this.view.altitude));
    this.view.azimuth = ((this.view.azimuth % 360) + 360) % 360;
    // Widest field: depends on the screen's shape (maxFov, #89).
    this.view.fov = Math.max(FOV_MIN, Math.min(maxFov(this.size.w / this.size.h), this.view.fov));
  }

  private resize(): void {
    const { canvas, overlay } = this.options;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return; // hidden (Earth view): keep the last size, aspect stays finite
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fontKey = ""; // resizing the canvas resets its context state
    this.uniforms.uAspect.value = w / h;
    this.uniforms.uHalfHeight.value = h / 2;
    this.clampView(); // the widest field depends on the aspect (portrait ↔ landscape)
    this.dirty = true;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.contextLost) return;
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
    // Marker arrival (#103): starts when the view stops turning, draws only while it runs.
    const arrival = this.arrival;
    if (arrival) {
      const now = performance.now();
      if (arrival.pending && !this.animation) {
        arrival.pending = false;
        arrival.start = now;
      }
      if (!arrival.pending) {
        if (arrivalProgress(now, arrival.start) >= 1) this.arrival = null; // one last clean frame
        this.dirty = true;
      }
    }
    // The reticle reused a cached target: draw once more when the throttle allows a new one.
    if (this.aimStale && this.pointing && this.aimThrottle.due(this.view, performance.now()))
      this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.render();
      this.options.onViewChange?.(this.view);
    }
  };

  /** Smallest view-frame z still projected for the current field and screen (see backCutoff). */
  private backZ(): number {
    const c = this.backZCache;
    const { fov } = this.view;
    const aspect = this.size.w / this.size.h;
    if (c.fov !== fov || c.aspect !== aspect) {
      c.fov = fov;
      c.aspect = aspect;
      c.z = backCutoff(fov, aspect);
    }
    return c.z; // memoised: read for every projected label and pick candidate
  }

  /** Combined J2000 → view matrix, for CPU-side projection (labels, picking). */
  private eqToView(): Mat3 {
    return multiplyMat3(viewMatrix(this.view), this.eq2hor);
  }

  private render(): void {
    const view = viewMatrix(this.view);
    this.uniforms.uView.value = toThreeMat3(view);
    this.uniforms.uViewInv.value = toThreeMat3(transpose(view));
    this.uniforms.uScale.value = stereoScale(this.view.fov);
    this.uniforms.uBackZ.value = this.backZ();
    // Daylight drowns the stars (at noon only magnitude ≲ −1 objects would remain): drawn
    // anyway unless the realistic layer is on (#106). Planets always follow the physical limit.
    const fovLimit = limitingMagnitude(this.view.fov);
    const realistic = this.layers.realisticDaylight;
    this.uniforms.uLimitMag.value = daylightStarLimit(fovLimit, this.daylight, realistic);
    this.uniforms.uPlanetLimit.value = planetLimitingMagnitude(
      physicalStarLimit(fovLimit, this.daylight),
      this.sunAltitude,
    );
    // Stronger ink over the day blue (same base opacities as setSelectedConstellation).
    this.uniforms.uLineOpacity.value = dayInkAlpha(
      this.selectedConstellation ? 0.3 : 0.45,
      this.dayInk(),
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

  /**
   * Screen position (CSS px) of a view-frame direction, null when off screen. Allocation-free:
   * the returned pair is reused by the next call, so read it before projecting again.
   */
  private toScreen(v: Vec3): [number, number] | null {
    return this.projectXYZ(v[0], v[1], v[2], stereoScale(this.view.fov));
  }

  /** toScreen for a direction given by its components, with the projection scale precomputed. */
  private projectXYZ(x: number, y: number, z: number, scale: number): [number, number] | null {
    if (z < this.backZ()) return null; // wide fields reach far behind the centre (#89)
    const { w, h } = this.size;
    // projectStereo, inlined: k = 2 / (1 + z) · scale, x scaled by the aspect ratio.
    const k = (2 / (1 + z)) * scale;
    const nx = (x * k * h) / w;
    const ny = y * k;
    if (Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return null;
    const out = this.screenPt;
    out[0] = ((nx + 1) / 2) * w;
    out[1] = ((1 - ny) / 2) * h;
    return out;
  }

  private drawLabels(): void {
    const { ctx } = this;
    const { canvas, stars, cardinals, theme } = this.options;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (this.dim > 0) {
      // A constellation is selected (#103): the rest of the sky (WebGL below, labels after)
      // fades under a veil of the sky colour; its figure is drawn above the veil.
      ctx.globalAlpha = this.dim;
      ctx.fillStyle = this.skyColor;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
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
    this.placeSelectedName(layout, m, isBelow);
    this.drawSelectionMarker(m, layout);
    for (const below of passes) {
      // 2. Sun and Moon
      if (this.bodies && this.options.bodyNames) {
        this.setLabelFont("700 11px", "0.12em", labelAlpha(0.95, below));
        const disc = this.uniforms.uBodySize.value / 2 + 6;
        for (const [body, dir] of [
          ["Sun", this.bodies.sun],
          ["Moon", this.bodies.moon],
        ] as const) {
          if (isBelow(dir) !== below || (body === "Moon" && !this.ephemerisOk)) continue;
          const p = this.toScreen(applyMat3(m, dir));
          if (!p) continue;
          // The name clears the selection marker's ring (#103).
          const marked = this.marked?.kind === "body" && this.marked.body === body;
          const offset = disc + (marked ? MARKER_GAP + 4 : 0);
          // The disc itself is occupied: later labels (path dates…) must not cover it.
          const half = disc - 6;
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
      if (this.planetsShown() && this.planets && this.options.planetNames) {
        this.setLabelFont("700 10px", "0.12em", labelAlpha(0.9, below));
        for (const p of this.planets) {
          if (isBelow(p.dir) !== below || !this.planetVisible(p.magnitude, below)) continue;
          const pos = this.toScreen(applyMat3(m, p.dir));
          if (!pos) continue;
          const label = this.options.planetNames[p.name].toUpperCase();
          const w = this.measure(label);
          const marked = this.marked?.kind === "planet" && this.marked.planet === p.name;
          const off = marked
            ? Math.max(STAR_MARKER_RADIUS, planetRadius(p) + MARKER_GAP) + 9 // clears the marker
            : planetRadius(p) + 5;
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
      // Never name a star the shader hides (by day, only with realisticDaylight: #106).
      const visibleLimit =
        (below ? this.uniforms.uLimitMagBelow.value : this.uniforms.uLimitMag.value) - 1;
      const maxMag = Math.min(
        visibleLimit,
        this.view.fov > 90 ? 1.2 : this.view.fov > 45 ? 2.2 : 3.5,
      );
      this.setLabelFont("400 10px", "0.08em", labelAlpha(this.inkAlpha(0.8, below), below));
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
        // The selected star's name clears its marker ring (#103).
        const o =
          this.marked?.kind === "star" && this.marked.index === i ? 9 + STAR_MARKER_RADIUS : 0;
        const r = layout.place([
          { x: x + 9 + o, y: y - H / 2, w, h: H }, // right
          { x: x - 9 - o - w, y: y - H / 2, w, h: H }, // left
          { x: x - w / 2, y: y - 8 - o - H, w, h: H }, // above
          { x: x - w / 2, y: y + 8 + o, w, h: H }, // below
        ]);
        if (r) ctx.fillText(s.name, r.x, r.y + H / 2);
      }

      // 5. Constellation names (rectangles kept for picking; the selected one is brighter)
      if (this.layers.constellationNames) {
        this.setLabelFont("500 10px", "0.18em", labelAlpha(this.inkAlpha(0.55, below), below));
        for (const { abbr, text, dir } of this.labels) {
          if (abbr === this.selectedConstellation || isBelow(dir) !== below) continue;
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
        this.ctx.globalAlpha = labelAlpha(0.55, below) * (1 - this.dim);
        if (eqView) this.drawGridGraduations(layout, eqView, "ra", "dec");
        if (this.layers.azimuthalGrid && !below)
          this.drawGridGraduations(layout, view, "az", "alt");
        if (this.layers.ecliptic) this.drawEclipticGraduations(layout, m);
      }
    }
    if (this.pointing) this.drawReticle();
    ctx.globalAlpha = 1;
  }

  /**
   * The selected constellation's name (#103), placed before every other label (so it is never
   * dropped), larger and at full strength above the veil, between two engraved hairlines.
   */
  private placeSelectedName(layout: LabelLayout, m: Mat3, isBelow: (d: Vec3) => boolean): void {
    const abbr = this.selectedConstellation;
    if (!abbr || !this.layers.constellationNames) return;
    const label = this.labels.find((l) => l.abbr === abbr);
    if (!label) return;
    const below = isBelow(label.dir);
    if (below && !this.layers.seeThroughGround) return;
    const p = this.toScreen(applyMat3(m, label.dir));
    if (!p) return;
    const [x, y] = p;
    const { ctx } = this;
    this.setLabelFont("700 13px", "0.22em", 1);
    const text = label.text.toUpperCase();
    const w = this.measure(text);
    const H = 16;
    const rule = 14; // hairline on each side
    const r = layout.place(
      [0, -18, 18, -36, 36].map((dy) => ({
        x: x - w / 2 - rule - 4,
        y: y + dy - H / 2,
        w: w + 2 * (rule + 4),
        h: H,
      })),
    );
    if (!r) return;
    this.constellationLabelRects.push({ abbr, rect: r });
    ctx.globalAlpha = labelAlpha(1, below);
    // Cartouche: the figure's stroke does not run through the name.
    ctx.fillStyle = this.skyColor;
    ctx.fillRect(r.x + rule + 1, r.y, r.w - 2 * rule - 2, H);
    ctx.fillStyle = this.options.theme.ink;
    const cy = r.y + H / 2;
    ctx.fillText(text, r.x + rule + 4, cy);
    ctx.strokeStyle = this.options.theme.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.x, cy);
    ctx.lineTo(r.x + rule, cy);
    ctx.moveTo(r.x + r.w - rule, cy);
    ctx.lineTo(r.x + r.w, cy);
    ctx.stroke();
  }

  /**
   * Engraved reticle around the selected star, planet, Sun or Moon (#103), dimmed below the
   * horizon like the rest (still drawn over an opaque ground: it shows where the object is),
   * with the arrival rings while they run. Its area is kept free of labels. No projection
   * allocates (projectXYZ); only the layout rectangle does, like every label.
   */
  private drawSelectionMarker(m: Mat3, layout: LabelLayout): void {
    const marked = this.marked;
    if (!marked) return;
    let d: Vec3 | undefined;
    let radius = STAR_MARKER_RADIUS;
    if (marked.kind === "star") d = this.starDirs[marked.index];
    else if (marked.kind === "body") {
      if (!this.bodies || (marked.body === "Moon" && !this.ephemerisOk)) return;
      d = marked.body === "Sun" ? this.bodies.sun : this.bodies.moon;
      radius = this.uniforms.uBodySize.value / 2 + MARKER_GAP;
    } else {
      if (!this.planetsShown() || !this.planets) return;
      const p = this.planets[PLANETS.indexOf(marked.planet)];
      if (!p || p.magnitude >= 99) return;
      d = p.dir;
      radius = Math.max(STAR_MARKER_RADIUS, planetRadius(p) + MARKER_GAP);
    }
    if (!d) return;
    const e = this.eq2hor;
    const below = e[6] * d[0] + e[7] * d[1] + e[8] * d[2] <= 0;
    const p = this.projectXYZ(
      m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
      m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
      m[6] * d[0] + m[7] * d[1] + m[8] * d[2],
      stereoScale(this.view.fov),
    );
    if (!p) return;
    const [x, y] = p;
    const { ctx } = this;
    const ink = this.options.theme.ink;
    this.figurePattern = inkPattern(ctx, ink, this.figurePattern);
    const alpha = labelAlpha(1, below);
    drawMarker(ctx, x, y, radius, alpha, ink, this.figurePattern.pattern);
    const keep = radius + 4; // no label is written across the ring
    layout.occupy({ x: x - keep, y: y - keep, w: 2 * keep, h: 2 * keep });
    const arrival = this.arrival;
    if (arrival && !arrival.pending)
      drawArrival(ctx, x, y, radius, arrivalProgress(performance.now(), arrival.start), alpha, ink);
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
    // The target is only recomputed when the view turned by > 0.2° or every 150 ms (#73).
    const now = performance.now();
    if (this.aimThrottle.due(this.view, now)) {
      const target = this.pick(cx, cy);
      this.aimThrottle.mark(this.view, now);
      this.aimStale = false;
      this.aimLabel =
        target && this.options.describeTarget
          ? this.options.describeTarget(target).toUpperCase()
          : "";
    } else this.aimStale = true;
    if (this.aimLabel) {
      this.setLabelFont("700 12px", "0.12em", 1);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = "center";
      ctx.fillText(this.aimLabel, cx, cy + 56);
    }
  }

  /** J2000 direction of the screen point (x, y); `m`: J2000 → view. */
  private tapDirection(x: number, y: number, m: Mat3): Vec3 {
    // Screen → view frame → J2000 (m is orthonormal: its inverse is its transpose).
    const { w, h } = this.size;
    const tap = unprojectStereo(
      (2 * x) / w - 1,
      1 - (2 * y) / h,
      stereoScale(this.view.fov),
      w / h,
    );
    return [
      m[0] * tap[0] + m[3] * tap[1] + m[6] * tap[2],
      m[1] * tap[0] + m[4] * tap[1] + m[7] * tap[2],
      m[2] * tap[0] + m[5] * tap[1] + m[8] * tap[2],
    ];
  }

  /**
   * Index of the star a tap at (x, y) designates (pickStar, score under `radius`), or −1.
   * `m`: J2000 → view.
   */
  private findStar(x: number, y: number, m: Mat3, seeThrough: boolean, radius: number): number {
    const { h } = this.size;
    const scale = stereoScale(this.view.fov);
    const toward = this.tapDirection(x, y, m);
    const fovLimit = limitingMagnitude(this.view.fov);
    const stars = this.options.stars;
    // Widest screen radius a star can win from: the score threshold plus the brightest bonus.
    const reach = STAR_PICK_RADIUS + (fovLimit - (stars[0]?.v ?? 0)) * STAR_BRIGHTNESS_BONUS;
    const e = this.eq2hor;
    return pickStar({
      mags: this.mags,
      dirs: this.starDirs,
      toward,
      cosMax: Math.cos(coneAngle(reach, scale, h)),
      up: [e[6], e[7], e[8]],
      limitAbove: starPickLimit(fovLimit, this.uniforms.uLimitMag.value),
      limitBelow: seeThrough ? starPickLimit(fovLimit, this.uniforms.uLimitMagBelow.value) : null,
      bonusFrom: fovLimit,
      radius,
      distance: (i) => {
        const d = this.starDirs[i]!;
        const p = this.projectXYZ(
          m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
          m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
          m[6] * d[0] + m[7] * d[1] + m[8] * d[2],
          scale,
        );
        return p ? Math.hypot(p[0] - x, p[1] - y) : NaN;
      },
    });
  }

  /** Daylight felt by the ink (labels, lines): 0 with the realistic layer (#106). */
  private dayInk(): number {
    return this.layers.realisticDaylight ? 0 : this.daylight;
  }

  /** Opacity of a star or constellation name over the day sky (below the horizon it is night). */
  private inkAlpha(base: number, below: boolean): number {
    return below ? base : dayInkAlpha(base, this.dayInk());
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
    // Under the veil of a selected constellation, labels fade like the rest of the sky (#103).
    this.ctx.globalAlpha = alpha * (1 - this.dim);
  }

  /** Width of a label in the current label font (cached). */
  private measure(text: string): number {
    let w = this.widths.get(text);
    if (w === undefined) this.widths.set(text, (w = this.ctx.measureText(text).width));
    return w;
  }

  /** Projects a view-frame direction without the screen bounds check of toScreen (for lines). */
  private toScreenUnclipped(v: Vec3): Point | null {
    if (v[2] < this.backZ()) return null;
    const { w, h } = this.size;
    const [nx, ny] = projectStereo(v, stereoScale(this.view.fov), w / h);
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h];
  }

  /**
   * Figure segments on screen, cut at the horizon (horizontal z = 0). The parts below it are kept
   * only with seeThroughGround, after the others (from index `belowFrom`). `only` restricts the
   * work to one constellation.
   */
  private projectFigures(
    only?: string | ((figure: { abbr: string; cap: Cap }) => boolean),
  ): (FigureShape & { belowFrom: number })[] {
    const view = viewMatrix(this.view);
    const seeThrough = this.layers.seeThroughGround;
    const shapes: (FigureShape & { belowFrom: number })[] = [];
    const project = (ha: Vec3, hb: Vec3, out: [Point, Point][]) => {
      const pa = this.toScreenUnclipped(applyMat3(view, ha));
      const pb = this.toScreenUnclipped(applyMat3(view, hb));
      if (pa && pb) out.push([pa, pb]);
    };
    for (const figure of this.figures) {
      const { abbr, segments } = figure;
      if (typeof only === "string" ? abbr !== only : only && !only(figure)) continue;
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

  /**
   * The selected figure as an engraved stroke: a 1-bit checkerboard band around a solid core,
   * then its stars, enlarged (#103). Drawn above the veil that dims the rest of the sky.
   */
  private drawSelectedFigure(): void {
    const abbr = this.selectedConstellation;
    if (!abbr) return;
    const { ctx } = this;
    const ink = this.options.theme.ink;
    this.figurePattern = inkPattern(ctx, ink, this.figurePattern);
    const [shape] = this.layers.constellationLines ? this.projectFigures(abbr) : [];
    if (shape) this.strokeFigure(shape, ink, this.figurePattern.pattern);
    const figure = this.figures.find((f) => f.abbr === abbr);
    if (!figure) return;
    const m = this.eqToView();
    const e = this.eq2hor;
    const scale = stereoScale(this.view.fov);
    const seeThrough = this.layers.seeThroughGround;
    const { stars } = this.options;
    for (const i of figure.starIndices) {
      const d = this.starDirs[i]!;
      const below = e[6] * d[0] + e[7] * d[1] + e[8] * d[2] <= 0;
      if (below && !seeThrough) continue;
      const p = this.projectXYZ(
        m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
        m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
        m[6] * d[0] + m[7] * d[1] + m[8] * d[2],
        scale,
      );
      if (!p) continue;
      const r = figureStarRadius(stars[i]!.v);
      // Engraved node: the stroke is cleared around the star (sky colour), then the disc.
      ctx.globalAlpha = labelAlpha(1, below);
      ctx.fillStyle = this.skyColor;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r + 1.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private strokeFigure(
    shape: FigureShape & { belowFrom: number },
    ink: string,
    pattern: CanvasPattern | null,
  ): void {
    const { ctx } = this;
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
      ctx.globalAlpha = labelAlpha(0.9, below);
      ctx.lineWidth = 7;
      ctx.strokeStyle = pattern ?? ink;
      ctx.stroke();
      ctx.globalAlpha = labelAlpha(1, below);
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * What a tap (or the reticle) at (x, y) designates, among what is drawn: constellation name
   * (unless a star lies right under the tap),
   * Sun or Moon, planet, star, then the figure around the point. Stars obey the shader's limits
   * (daylight above the horizon, night below it, nothing below with the opaque ground), and are
   * searched in a cone around the tap direction without projecting the whole catalogue (#73).
   */
  private pick(x: number, y: number): SkySelection | null {
    // A constellation name is an explicit target: it wins over the stars around it.
    // Below the horizon, only what seeThroughGround shows can be picked (night limits there).
    const seeThrough = this.layers.seeThroughGround;
    const m = this.eqToView();
    const label = pickLabel([x, y], this.constellationLabelRects);
    if (label) {
      // Except a star right under the finger: wide fields pack names against stars (#89).
      const i = this.findStar(x, y, m, seeThrough, STAR_OVER_LABEL_RADIUS);
      const star = i >= 0 ? this.options.stars[i] : undefined;
      return star ? { kind: "star", star } : { kind: "constellation", abbr: label };
    }
    if (this.bodies) {
      const radius = Math.max(22, this.uniforms.uBodySize.value / 2);
      for (const [body, dir] of [
        ["Moon", this.bodies.moon],
        ["Sun", this.bodies.sun],
      ] as const) {
        if (body === "Moon" && !this.ephemerisOk) continue;
        if (applyMat3(this.eq2hor, dir)[2] < 0 && !seeThrough) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (p && Math.hypot(p[0] - x, p[1] - y) < radius) return { kind: "body", body };
      }
    }
    if (this.planetsShown() && this.planets) {
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

    const { h } = this.size;
    const scale = stereoScale(this.view.fov);
    const index = this.findStar(x, y, m, seeThrough, STAR_PICK_RADIUS);
    const stars = this.options.stars;
    if (index >= 0) return { kind: "star", star: stars[index]! };
    // No star or body nearby: the figure the tap falls in, if any. Only figures whose bounding
    // cap holds the tap direction (grown by the segment slop) are projected.
    if (!this.layers.constellationLines) return null;
    const slop = coneAngle(14, scale, h);
    const toward = this.tapDirection(x, y, m);
    const abbr = pickFigure(
      [x, y],
      this.projectFigures((f) => inCap(f.cap, toward, slop)),
    );
    return abbr ? { kind: "constellation", abbr } : null;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const signal = this.listeners.signal;
    canvas.style.touchAction = "none";
    let pinchDist = 0;

    canvas.addEventListener(
      "pointerdown",
      (e) => {
        canvas.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.velocity = { az: 0, alt: 0 };
        this.moved = 0;
        if (this.pointers.size === 2) pinchDist = this.pinchDistance();
      },
      { signal },
    );

    canvas.addEventListener(
      "pointermove",
      (e) => {
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
          if (pinchDist > 0) this.zoomBy(pinchDist / d);
          pinchDist = d;
        }
        this.clampView();
        this.dirty = true;
      },
      { signal },
    );

    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0 && this.moved < 6) {
        const rect = canvas.getBoundingClientRect();
        this.options.onSelect?.(this.pick(e.clientX - rect.left, e.clientY - rect.top));
      }
      pinchDist = 0;
    };
    canvas.addEventListener("pointerup", end, { signal });
    canvas.addEventListener("pointercancel", end, { signal });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomBy(Math.exp(e.deltaY * 0.0012));
        this.clampView();
        this.dirty = true;
      },
      { passive: false, signal },
    );
  }

  /** Pinch / wheel zoom; the field stops at maxFov (no flight to the Earth view, #89). */
  private zoomBy(factor: number): void {
    this.view.fov *= factor;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
