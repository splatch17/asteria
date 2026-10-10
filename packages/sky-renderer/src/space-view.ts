import * as THREE from "three";
import {
  PLANETS,
  bodyPosition,
  greenwichMeanSiderealTime,
  meanObliquity,
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
import { MARKER_GAP, STAR_MARKER_RADIUS, drawMarker, inkPattern } from "./highlight";
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
import {
  BODY_TARGETS,
  BodyFrame,
  bodyPole,
  bodyRadius,
  bodyViewDirection,
  bodyViewDistance,
  hiddenBySphere,
  isBodyTarget,
  worldPosition,
  type BodyTarget,
} from "./body-frame";
import { BodyGlobe, bodyKind } from "./body-globe";
import {
  FLIGHT_MS,
  FlightPath,
  LANDING_VIEW,
  ORBIT_FOV,
  ORBIT_RADIUS,
  OverZoom,
  flightEase,
  flightProgress,
  globeDetail,
  headingOf,
  horizonBasis,
  shouldEnterSky,
  type HorizonBasis,
} from "./flight";
import type { ViewState } from "./view";
import {
  DEFAULT_REFERENCE_FRAME,
  FRAME_TRANSITION_MS,
  directionInFrame,
  frameOf,
  isAvailableFrame,
  orbitInFrame,
  orbitPose,
  type FrameOrbit,
  type ReferenceFrameId,
} from "./reference-frames";
import { GestureInput } from "./gesture-input";
import { easeOut, panLimit, panScale, raySphere, wrapDegrees, zoomAnchorShift } from "./gestures";

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
  labels: {
    here: string;
    sun: string;
    moon: string;
    pole: string;
    /** Ecliptic pole, labelled in the ecliptic frame (#122). */
    eclipticPole?: string;
  };
  /** Label of the axis tilt in the ecliptic frame, from the obliquity in degrees (#122). */
  formatObliquity?: (degrees: number) => string;
  /** Initial reference frame (default: star-fixed); unavailable frames are ignored. */
  frame?: ReferenceFrameId;
  /** Body orbited by the body-centred frame (#123), default the Moon. */
  body?: BodyTarget;
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
  /**
   * Zooming in past the closest distance with "you are here" near the centre of the globe (#37):
   * the caller lands in the sky map (see flyToSky).
   */
  onEnterSky?: () => void;
}

/** A flight between the sky map's point of view and the orbit (#37), see flight.ts. */
export interface FlightOptions {
  /** Duration in ms (default FLIGHT_MS); 0 jumps to the end (reduced motion). */
  duration?: number;
  /** Called after each rendered frame with the altitude progress s (0 = ground, 1 = orbit). */
  onFrame?: (s: number) => void;
  /** Called once the flight is over (also when it is cancelled). */
  onDone?: () => void;
}

/** Sunlight on the Moon and planets is recomputed when the date moves by more than this. */
const LIGHT_REFRESH_MS = 3_600_000;

const DEG = Math.PI / 180;
/** J2000 obliquity (IAU 2006): the ecliptic circle is drawn in J2000 directions, then precessed. */
const OBLIQUITY_J2000 = meanObliquity(new Date(Date.UTC(2000, 0, 1, 12))) * DEG;
const DIST_MIN = 1.6;
const DIST_MAX = 40;
/** Duration of the recentring and reset tweens, ms. */
const RECENTRE_MS = 600;
/** Shortest duration of a trip to or from a body (#123), ms (unless instant). */
export const BODY_TRANSITION_MS = 1600;
const ORIGIN = new THREE.Vector3();
/** Apparent radius (CSS px) from which a body's globe replaces its glyph (body frame). */
const GLOBE_MIN_PX = 6;

/** Orbit camera of the Earth view, in the current reference frame (see reference-frames.ts). */
type EarthOrbit = FrameOrbit;
/** Radius of the dashed ecliptic plane ring drawn in the ecliptic frame, Earth radii. */
const ECLIPTIC_RING = 1.7;
/** Radius of the arc marking the axis tilt between the two poles, Earth radii. */
const TILT_ARC = 1.32;
const TILT_ARC_SEGMENTS = 24;

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

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
  /** Earth's axis (to 1.5 radii): hidden near the ground, where it would stand in the sky. */
  private readonly axis: THREE.LineSegments;
  /** Camera, in the reference frame's coordinates, round the target point (pan). */
  private orbit: EarthOrbit = { lon: 0, lat: 30, dist: 4, tx: 0, ty: 0, tz: 0 };
  // --- Reference frames (#122), see reference-frames.ts
  private frameId: ReferenceFrameId = DEFAULT_REFERENCE_FRAME;
  /** Rotation frame → world at the current date, and the frame's target (world). */
  private readonly frameQuat = new THREE.Quaternion();
  private readonly frameOrigin = new THREE.Vector3();
  /** The frame's pole in the world: the top of the screen. */
  private readonly frameUp = new THREE.Vector3(0, 0, 1);
  /** Slerp from the camera's pose when the frame changed (frozen) to the new frame's pose. */
  private frameTween: {
    from: ReferenceFrameId;
    /** Body the camera left (body-centred frame), or null. */
    fromBody: BodyTarget | null;
    /** Camera distance to its target when the change started (interpolated geometrically). */
    dist: number;
    start: number;
    duration: number;
    /** Eased progress, updated each frame. */
    k: number;
    /** Raw time fraction 0 … 1, updated each frame. */
    t: number;
    readonly quat: THREE.Quaternion;
    readonly target: THREE.Vector3;
  } | null = null;
  private readonly frameTweenState = {
    quat: new THREE.Quaternion(),
    target: new THREE.Vector3(),
  };
  // --- Body-centred frame (#123), see body-frame.ts and body-globe.ts
  private readonly bodyFrame = new BodyFrame("Moon");
  /** Globe of the target body; and of the body being left, during a transition. */
  private globe3d: BodyGlobe;
  private fadingGlobe: BodyGlobe;
  /** World positions (Earth radii, light-time corrected): Sun, Moon, planets (PLANETS order). */
  private readonly worldPos = Array.from(
    { length: 1 + BODY_TARGETS.length },
    () => new THREE.Vector3(),
  );
  private worldPosOk = false;
  /** Sky glyph directions as given (geocentric): Sun and Moon, then the planets. */
  private readonly geoBodyDirs = new Float32Array(6);
  private readonly geoPlanetDirs = new Float32Array(3 * PLANETS.length);
  /** The glyph directions currently hold the camera-relative blend. */
  private skyBlended = false;
  /** Planet magnitudes as given (a planet drawn as a globe is hidden from the glyphs). */
  private readonly planetMags = new Float32Array(PLANETS.length).fill(99);
  /** Kinds (0 = Moon, 1 … 7 = planets) drawn as globes, whose glyphs are hidden; −1: none. */
  private globeKindA = -1;
  private globeKindB = -1;
  private globesApplied = false;
  /** The first refresh in the body frame places the camera round the body. */
  private pendingBodyOrbit = false;
  /** Where the camera was round the Earth before leaving for a body: back there on return. */
  private readonly earthReturn = { dir: new THREE.Vector3(0, 0, 1), dist: ORBIT_RADIUS };
  private readonly tripTmp = {
    look: new THREE.Quaternion(),
    dest: new THREE.Vector3(),
    up: new THREE.Vector3(),
    m: new THREE.Matrix4(),
  };
  private readonly bodyTmp = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    o: new THREE.Vector3(),
    sky: new THREE.Vector3(),
    rel: new THREE.Vector3(),
  };
  /** Ecliptic plane ring, ecliptic pole line and tilt arc, in ecliptic frame axes. */
  private readonly eclipticGuide = new THREE.Group();
  private readonly guideMaterials: THREE.LineDashedMaterial[] = [];
  private readonly tiltArc: THREE.Line;
  private tiltEpsilon = NaN;
  /** Mean obliquity of date, degrees, and its label (formatted once per value). */
  private obliquity = 0;
  private obliquityLabel = { value: NaN, text: "" };
  private readonly poseTarget = new THREE.Vector3();
  /** Animated move of the orbit (recentre, reset); null when none. */
  private camTween: { from: EarthOrbit; to: EarthOrbit; start: number } | null = null;
  private lastFrame = 0;
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
  private readonly input: GestureInput;
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
  /** Selected star (catalogue index), Sun, Moon or planet (PLANETS index), marked (#103). */
  private marked: { kind: "star" | "sun" | "moon" | "planet"; index: number } | null = null;
  /** 1-bit checkerboard of the ink colour, for the marker's band. */
  private markerPattern: { ink: string; pattern: CanvasPattern | null } | null = null;
  private readonly tmp = {
    dir: new THREE.Vector3(),
    light: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    prime: new THREE.Vector3(),
  };
  /** Scratch objects of the per-frame projections (screenOf, hiddenByEarth, labels). */
  private readonly frameTmp = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    sun: new THREE.Vector3(),
    moon: new THREE.Vector3(),
    here: new THREE.Vector3(),
    marker: new THREE.Vector3(),
    tilt: new THREE.Vector3(),
    eclPole: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    pole: new THREE.Vector3(0, 0, 1),
    point: [0, 0] as [number, number],
    size: new THREE.Vector2(),
    shift: { x: 0, y: 0 },
  };
  // --- Sky <-> Earth flight (#37)
  private readonly flightPath = new FlightPath();
  private flight: {
    direction: "out" | "in";
    start: number;
    duration: number;
    options: FlightOptions;
  } | null = null;
  /** Observer's horizon in the world frame, at the current date. */
  private readonly horizon: HorizonBasis = {
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  /** Zoom pushed past the closest distance, towards the sky map. */
  private readonly overZoom = new OverZoom();

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
      uFigures: { value: 1 },
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
    const member = new Float32Array(stars.length);
    for (const polys of Object.values(lines)) {
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const ia = indexOf.get(poly[i]!);
          const ib = indexOf.get(poly[i + 1]!);
          if (ia === undefined || ib === undefined) continue;
          member[ia] = member[ib] = 1;
          for (const j of [ia, ib]) {
            segs.push(motion.dirs[3 * j]!, motion.dirs[3 * j + 1]!, motion.dirs[3 * j + 2]!);
            segPm.push(motion.pm[3 * j]!, motion.pm[3 * j + 1]!, motion.pm[3 * j + 2]!);
          }
        }
      }
    }
    this.constellationLines = this.skyLines(segs, 0.28, segPm);
    // Figure stars are reinforced while the lines are shown (uFigures, #104).
    starGeo.setAttribute("aMember", new THREE.BufferAttribute(member, 1));
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
    const ecliptic = this.skyLines(circle(OBLIQUITY_J2000), 0.5);
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
    this.axis = this.surfaceLines([0, 0, -1.5, 0, 0, 1.5], 0.6);

    // Ecliptic frame guide (#122): dashed ecliptic plane round the Earth, dashed ecliptic pole
    // line, and the arc from it to the Earth's axis (the obliquity). Ecliptic frame axes.
    const ring: number[] = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * 2 * Math.PI;
      ring.push(ECLIPTIC_RING * Math.cos(t), ECLIPTIC_RING * Math.sin(t), 0);
    }
    this.tiltArc = this.dashedLine(new Array<number>(3 * (TILT_ARC_SEGMENTS + 1)).fill(0), 0.8);
    this.eclipticGuide.add(
      this.dashedLine(ring, 0.7),
      this.dashedLine([0, 0, -1.5, 0, 0, 1.5], 0.55),
      this.tiltArc,
    );
    this.eclipticGuide.visible = false;

    // Globes of the body-centred frame (#123), hidden until it is chosen.
    const engravedUniforms = {
      uInk: this.uniforms.uInk,
      uBase: this.uniforms.uBase,
      uDpr: this.uniforms.uDpr,
    };
    this.globe3d = new BodyGlobe(engravedUniforms);
    this.fadingGlobe = new BodyGlobe(engravedUniforms);
    const body = options.body && isBodyTarget(options.body) ? options.body : "Moon";
    this.bodyFrame.body = body;
    this.globe3d.setBody(body);

    this.scene.add(
      this.globe3d.object,
      this.fadingGlobe.object,
      this.earth,
      this.axis,
      this.eclipticGuide,
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
    this.input = new GestureInput(canvas, this.gestures(), this.listeners.signal);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.setStyle(options.style ?? "engraving");
    if (options.frame && isAvailableFrame(options.frame)) this.frameId = options.frame;
    this.pendingBodyOrbit = this.frameId === "body";
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
    this.globe3d.setRealistic(realistic);
    this.fadingGlobe.setRealistic(realistic);
    this.globesApplied = false;
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
    if (selection?.kind === "star") {
      const index = this.options.stars.findIndex((s) => s.hip === selection.star.hip);
      this.marked = index < 0 ? null : { kind: "star", index };
    } else if (selection?.kind === "body")
      this.marked = { kind: selection.body === "Sun" ? "sun" : "moon", index: 0 };
    else if (selection?.kind === "planet")
      this.marked = { kind: "planet", index: PLANETS.indexOf(selection.planet) };
    else this.marked = null;
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
      this.planetMags.fill(99); // left out: hidden by the shader
      for (const p of planets) {
        const i = PLANETS.indexOf(p.name);
        this.planets[i] = unitVector(p.ra, p.dec);
        this.planetMags[i] = p.magnitude;
      }
      for (let i = 0; i < PLANETS.length; i++) mags.setX(i, this.planetMags[i]!);
      mags.needsUpdate = true;
      this.globesApplied = false;
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
    this.uniforms.uFigures.value = this.layers.constellationLines ? 1 : 0;
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
   * Places the camera: longitude/latitude in the current reference frame (star-fixed: equator of
   * date), in degrees, and distance in Earth radii. The camera looks at the frame's target.
   */
  setOrbit(orbit: Partial<{ lon: number; lat: number; dist: number }>): void {
    Object.assign(this.orbit, orbit);
    this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat));
    this.orbit.dist = Math.max(this.distMin(), Math.min(this.distMax(), this.orbit.dist));
    this.clampPan();
    this.input.stopInertia();
    this.camTween = null;
    this.dirty = true;
  }

  /**
   * Changes the reference frame (#122). The camera keeps its place and target; its orientation
   * slerps to the new frame's (its pole up) in `duration` ms (FRAME_TRANSITION_MS by default; 0
   * jumps, for reduced motion). Frames not available yet are ignored.
   */
  setFrame(
    id: ReferenceFrameId,
    { duration = FRAME_TRANSITION_MS }: { duration?: number } = {},
  ): void {
    if (id === this.frameId || !isAvailableFrame(id)) return;
    this.changeFrame(id, this.bodyFrame.body, duration);
  }

  /**
   * Body orbited by the body-centred frame (#123). In that frame the camera travels to it (in
   * `duration` ms, at least BODY_TRANSITION_MS; 0 jumps, for reduced motion); otherwise it is
   * kept for the next switch to that frame.
   */
  setBodyTarget(body: BodyTarget, { duration = BODY_TRANSITION_MS }: { duration?: number } = {}) {
    if (!isBodyTarget(body) || body === this.bodyFrame.body) return;
    if (this.frameId === "body") {
      this.changeFrame("body", body, duration);
      return;
    }
    this.bodyFrame.body = body;
    this.globe3d.setBody(body);
  }

  getBodyTarget(): BodyTarget {
    return this.bodyFrame.body;
  }

  getFrame(): ReferenceFrameId {
    return this.frameId;
  }

  /** Points the camera at the observer's place, at the given distance (Earth radii). */
  focusObserver(dist = 4): void {
    this.input.stopInertia();
    this.camTween = null;
    this.orbit = this.observerOrbit(dist);
    this.dirty = true;
  }

  /**
   * Back to the view the Earth view opens on (above the observer, at the orbit radius, no pan),
   * within the current reference frame, animated unless `instant` (#107: the recentre button
   * and a double tap beside the globe).
   */
  resetView(instant = false): void {
    if (this.flight) return;
    this.moveTo(
      this.frameId === "body" ? this.bodyOrbit() : this.observerOrbit(ORBIT_RADIUS),
      instant,
    );
  }

  /**
   * Leaves the sky map (#37): the camera starts at the observer's eye, looking along the map's
   * `view`, and climbs to the orbit above the observer (as focusObserver(ORBIT_RADIUS)). The
   * view must be running (start()); input is ignored until the flight ends.
   */
  flyFromSky(view: ViewState, options: FlightOptions = {}): void {
    this.prepareFlight();
    // In the body frame the flight ends round the Earth, celestial north up; the trip to the
    // body follows (endFlight).
    const up = this.frameId === "body" ? Z_AXIS : this.frameUp;
    this.flightPath.setup(this.horizon, view, null, ORBIT_RADIUS, up);
    this.beginFlight("out", options);
  }

  /**
   * Lands in the sky map (#37), from the current orbit down to the observer's eye. Returns the
   * sky map view the flight ends on (heading as the camera's, see headingOf), to be given to the
   * map before it is shown.
   */
  flyToSky(options: FlightOptions = {}): ViewState {
    this.prepareFlight();
    this.frameTween = null; // from the frame's own pose, whose up the flight starts with
    this.placeCamera();
    const view: ViewState = {
      azimuth: headingOf(this.camera.quaternion, this.horizon),
      altitude: LANDING_VIEW.altitude,
      fov: LANDING_VIEW.fov,
      roll: 0,
    };
    // From where the camera is (a pan moves it off the orbit's sphere).
    const dist = this.camera.position.length();
    const dir = this.camera.position.clone().normalize();
    this.flightPath.setup(this.horizon, view, dir, dist, this.frameUp);
    this.beginFlight("in", options);
    return view;
  }

  /** A flight is under way. */
  isFlying(): boolean {
    return this.flight !== null;
  }

  /** Ends a flight at once (its onDone is called). */
  cancelFlight(): void {
    if (this.flight) this.endFlight();
  }

  /**
   * Compiles the shaders and uploads the globe's textures ahead of the first frame, so that a
   * flight does not stall on its first frame (preloading, #37). Works while hidden.
   */
  async prepare(): Promise<void> {
    this.refresh();
    this.placeCamera();
    for (const t of [this.uniforms.uRelief.value, this.uniforms.uLights.value])
      this.renderer.initTexture(t);
    await this.renderer.compileAsync(this.scene, this.camera);
    // One frame while hidden (the canvas keeps its layout): uploads the geometry buffers too.
    if (!this.contextLost && this.options.canvas.clientWidth > 0) this.render();
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
    this.globe3d.dispose();
    this.fadingGlobe.dispose();
    this.renderer.dispose();
  }

  // --- internals

  /** Above the observer's place, in the current frame, no pan. */
  private observerOrbit(dist: number): EarthOrbit {
    if (this.stale) this.refresh();
    const gst = greenwichMeanSiderealTime(this.date);
    const { longitude, latitude } = this.observer;
    const [lon, lat] = [(longitude + gst) * DEG, latitude * DEG];
    const dir = this.frameTmp.a.set(
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    );
    const at = directionInFrame(dir, this.frameQuat, { lon: 0, lat: 0 });
    return { lon: at.lon, lat: Math.max(-89, Math.min(89, at.lat)), dist, tx: 0, ty: 0, tz: 0 };
  }

  /** Frame rotation, target and pole at the current date. */
  private updateFrame(): void {
    const frame = this.frameId === "body" ? this.bodyFrame : frameOf(this.frameId);
    frame.orientation(this.date, this.frameQuat);
    frame.target(this.date, this.frameOrigin);
    this.frameUp.set(0, 0, 1).applyQuaternion(this.frameQuat);
  }

  /** Eased progress of the frame slerp at time `now`; ends it at 1. */
  private stepFrameTween(now: number): void {
    const tw = this.frameTween;
    if (!tw) return;
    tw.t = Math.min(1, Math.max(0, (now - tw.start) / tw.duration));
    tw.k = flightEase(tw.t);
    if (tw.k >= 1) {
      this.frameTween = null;
      // The globe of the body left disappears, its glyph comes back.
      if (tw.fromBody) this.update();
    }
    this.dirty = true;
  }

  /** Weight of the ecliptic frame's guide: 1 in that frame, faded in or out by a transition. */
  private eclipticWeight(): number {
    const tw = this.frameTween;
    const on = this.frameId === "ecliptic" ? 1 : 0;
    if (!tw) return on;
    const was = tw.from === "ecliptic" ? 1 : 0;
    return was + (on - was) * tw.k;
  }

  private moveTo(to: EarthOrbit, instant: boolean): void {
    this.input.stopInertia();
    const from = { ...this.orbit };
    to.lon = from.lon + wrapDegrees(to.lon - from.lon); // shortest way round
    if (instant) {
      this.orbit = to;
      this.camTween = null;
    } else this.camTween = { from, to, start: performance.now() };
    this.dirty = true;
  }

  /** Orbit at time `now` of the recentring tween. */
  private stepCamTween(now: number): void {
    const tw = this.camTween;
    if (!tw) return;
    const k = easeOut((now - tw.start) / RECENTRE_MS);
    const { from: a, to: b } = tw;
    const o = this.orbit;
    o.lon = a.lon + (b.lon - a.lon) * k;
    o.lat = a.lat + (b.lat - a.lat) * k;
    o.dist = a.dist * (b.dist / a.dist) ** k;
    o.tx = a.tx + (b.tx - a.tx) * k;
    o.ty = a.ty + (b.ty - a.ty) * k;
    o.tz = a.tz + (b.tz - a.tz) * k;
    if (k >= 1) this.camTween = null;
    this.dirty = true;
  }

  /**
   * Keeps the pan within reach: the centre of the frame's target (the Earth, or the body in the
   * body-centred frame) stays well inside the screen.
   */
  private clampPan(): void {
    const o = this.orbit;
    const max = panLimit(o.dist, ORBIT_FOV, this.camera.aspect);
    const n = Math.hypot(o.tx, o.ty, o.tz);
    if (n <= max) return;
    const k = max / n;
    o.tx *= k;
    o.ty *= k;
    o.tz *= k;
  }

  /** Moves the target along the camera's right and up axes (world units). */
  private shiftTarget(right: number, up: number): void {
    const e = this.camera.matrixWorld.elements; // columns: right, up, back
    // World shift, then into the frame's axes (the pan follows the frame, e.g. the Earth).
    const d = this.frameTmp.a.set(
      right * e[0]! + up * e[4]!,
      right * e[1]! + up * e[5]!,
      right * e[2]! + up * e[6]!,
    );
    d.applyQuaternion(this.frameTmp.q.copy(this.frameQuat).invert());
    const o = this.orbit;
    o.tx += d.x;
    o.ty += d.y;
    o.tz += d.z;
    this.clampPan();
    this.dirty = true;
  }

  /**
   * Gesture intents (CSS px) mapped onto the orbit, in the current reference frame. Its pole
   * stays up (no twist): celestial north in the star-fixed and Earth-fixed frames, the ecliptic
   * pole in the ecliptic frame; the flights to and from the sky map land on that same up.
   */
  private gestures() {
    const canvas = this.options.canvas;
    const focal = () => 1 / Math.tan((ORBIT_FOV * DEG) / 2);
    return {
      enabled: () => !this.flight,
      grab: () => {
        this.camTween = null;
      },
      orbit: (dx: number, dy: number) => {
        // Dragging turns the globe under the finger (the camera orbits the other way).
        const k = (60 / Math.max(1, canvas.clientHeight)) * (this.orbit.dist / (4 * this.radius()));
        this.orbit.lon -= dx * k;
        this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat + dy * k));
        this.dirty = true;
      },
      pan: (dx: number, dy: number) => {
        const k = panScale(this.orbit.dist, focal(), canvas.clientHeight);
        this.shiftTarget(-dx * k, dy * k);
      },
      zoom: (factor: number, x: number, y: number) => {
        const d = this.orbit.dist;
        this.zoom(factor);
        if (this.flight) return; // zoomed into the sky (#37): the flight owns the camera
        // Towards the point between the fingers (or under the cursor).
        const { clientWidth: w, clientHeight: h } = canvas;
        const shift = zoomAnchorShift(
          (2 * x) / Math.max(1, w) - 1,
          1 - (2 * y) / Math.max(1, h),
          this.camera.aspect,
          d,
          focal(),
          this.orbit.dist / d,
          this.frameTmp.shift,
        );
        this.shiftTarget(shift.x, shift.y);
      },
      tap: (x: number, y: number) => this.options.onSelect?.(this.pick(x, y)),
      doubleTap: (x: number, y: number) => this.centreAt(x, y),
      changed: () => (this.dirty = true),
    };
  }

  /** Double tap: the place of the globe under (x, y) turns to face the camera; beside it, reset. */
  private centreAt(x: number, y: number): void {
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const { a: dir } = this.frameTmp;
    const o = this.camera.position;
    dir
      .set((2 * x) / Math.max(1, w) - 1, 1 - (2 * y) / Math.max(1, h), 0.5)
      .unproject(this.camera)
      .sub(o)
      .normalize();
    const c = this.targetCentre();
    const t = raySphere(o.x - c.x, o.y - c.y, o.z - c.z, dir.x, dir.y, dir.z, this.radius());
    if (t < 0) {
      this.resetView();
      return;
    }
    dir.multiplyScalar(t).add(o).sub(c); // the point of the globe, from its centre
    const { lon, lat } = directionInFrame(dir, this.frameQuat, { lon: 0, lat: 0 });
    const clamped = Math.max(-89, Math.min(89, lat));
    this.moveTo({ lon, lat: clamped, dist: this.orbit.dist, tx: 0, ty: 0, tz: 0 }, false);
  }

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
    this.globe3d.useRealistic(real.surfaceUniforms());
    this.fadingGlobe.useRealistic(real.surfaceUniforms());
    this.globesApplied = false;
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

  /** Date-dependent state and the observer's horizon in the world frame, now. */
  private prepareFlight(): void {
    if (this.stale) this.refresh();
    const gst = greenwichMeanSiderealTime(this.date);
    horizonBasis(this.observer.latitude, this.observer.longitude, gst, this.horizon);
    // The canvas may just have been shown: size it before the first frame (only if it changed:
    // resizing reallocates the drawing buffer).
    const size = this.renderer.getSize(this.frameTmp.size);
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    if (w !== size.x || h !== size.y) this.resize();
  }

  private beginFlight(direction: "out" | "in", options: FlightOptions): void {
    this.cancelFlight();
    this.input.cancel();
    this.camTween = null;
    this.frameTween = null;
    this.overZoom.reset();
    this.flight = {
      direction,
      start: performance.now(),
      duration: options.duration ?? FLIGHT_MS,
      options,
    };
    this.dirty = true;
  }

  /** Time fraction of the flight now, in [0, 1]. */
  private flightTime(now: number): number {
    const f = this.flight!;
    return f.duration > 0 ? Math.min(1, Math.max(0, (now - f.start) / f.duration)) : 1;
  }

  private endFlight(): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    if (f.direction === "out") {
      // Hand over to the orbit camera exactly where the flight ends; in the body frame, travel
      // on to the body from there.
      if (this.frameId === "body") this.tripFromEarth(f.duration > 0 ? BODY_TRANSITION_MS : 0);
      else this.orbit = this.observerOrbit(ORBIT_RADIUS);
    }
    this.dirty = true;
    f.options.onDone?.();
  }

  /**
   * Orbit camera: position from (lon, lat, dist) round the target, looking at it, the frame's
   * pole up; during a frame change, slerped from the pose the change started from.
   */
  private placeCamera(): void {
    const { position, quaternion } = this.camera;
    const target = this.poseTarget;
    orbitPose(this.frameQuat, this.frameOrigin, this.orbit, position, quaternion, target);
    const tw = this.frameTween;
    if (tw) {
      // A trip to or from a body (#123) first turns towards the destination, then travels;
      // a frame change round the Earth does both together.
      const trip = tw.fromBody !== null || this.frameId === "body";
      const move = trip ? flightEase((tw.t - 0.15) / 0.85) : tw.k;
      const { look, dest, up } = this.tripTmp;
      dest.copy(target);
      up.copy(this.frameUp);
      look.copy(quaternion);
      quaternion.slerpQuaternions(tw.quat, look, move);
      // A trip covers the distance geometrically (the same number of frames from 1 000 000 km
      // to 100 000 km as from 100 000 km to 10 000 km), so that a far planet grows steadily
      // instead of appearing in the last frames.
      const span = tw.target.distanceTo(dest);
      const eps = trip && span > 0 ? this.orbit.dist / (span + this.orbit.dist) : 1;
      const remaining = eps < 1 ? (eps ** move - eps) / (1 - eps) : 1 - move;
      target.lerpVectors(dest, tw.target, remaining);
      // Back from the target along the slerped view axis, the distance interpolated
      // geometrically (the same for a frame change round the Earth, 4 → 1.1 for a trip to the
      // Moon, so that the approach slows down near the body).
      const d = tw.dist > 0 ? tw.dist * (this.orbit.dist / tw.dist) ** move : this.orbit.dist;
      position.set(0, 0, d).applyQuaternion(quaternion).add(target);
      if (trip) {
        // Looking at the destination from where the camera is (its final pose at the end).
        this.tripTmp.m.lookAt(position, dest, up);
        look.setFromRotationMatrix(this.tripTmp.m);
        quaternion.slerpQuaternions(tw.quat, look, flightEase(tw.t / 0.4));
      }
    }
    this.setFov(ORBIT_FOV);
    this.camera.updateMatrixWorld();
  }

  private setFov(fov: number): void {
    if (fov === this.camera.fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
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

  /** Dashed ink line (a strip) of the ecliptic frame's guide; base opacity in userData. */
  private dashedLine(points: number[], opacity: number): THREE.Line {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const m = new THREE.LineDashedMaterial({
      transparent: true,
      opacity,
      depthWrite: false,
      dashSize: 0.06,
      gapSize: 0.05,
    });
    m.userData.ink = true; // recoloured by setTheme
    m.userData.opacity = opacity;
    this.guideMaterials.push(m);
    const line = new THREE.Line(g, m);
    line.computeLineDistances();
    return line;
  }

  /** Arc from the ecliptic pole to the Earth's axis, at the obliquity of date (ecliptic axes). */
  private updateTiltArc(): void {
    const eps = this.obliquity * DEG;
    if (Math.abs(eps - this.tiltEpsilon) < 1e-7) return;
    this.tiltEpsilon = eps;
    const pos = this.tiltArc.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i <= TILT_ARC_SEGMENTS; i++) {
      // The celestial pole in ecliptic axes is (0, sin ε, cos ε).
      const a = (eps * i) / TILT_ARC_SEGMENTS;
      pos.setXYZ(i, 0, TILT_ARC * Math.sin(a), TILT_ARC * Math.cos(a));
    }
    pos.needsUpdate = true;
    this.tiltArc.computeLineDistances();
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
    this.updateFrame();
    this.obliquity = meanObliquity(this.date);
    this.eclipticGuide.quaternion.setFromAxisAngle(X_AXIS, this.obliquity * DEG);
    this.updateTiltArc();
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
    // Geocentric glyph directions, before the body frame's camera-relative blend (render).
    this.geoBodyDirs.set(this.bodyPoints.geometry.getAttribute("aDir").array as Float32Array);
    this.geoPlanetDirs.set(this.planetPoints.geometry.getAttribute("aDir").array as Float32Array);
    this.skyBlended = false;
    this.globesApplied = false;
    this.refreshBodies(prec);
    if (this.pendingBodyOrbit && this.frameId === "body" && this.worldPosOk) {
      this.pendingBodyOrbit = false;
      this.orbit = this.bodyOrbit();
    }
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
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    // Inertia of the orbit (calls the orbit gesture), then the recentring tween.
    if (!this.flight) {
      this.input.step(dt);
      this.stepCamTween(now);
      this.stepFrameTween(now);
    }
    if (this.stale) this.refresh();
    if (this.flight) {
      // A flight draws every frame, the camera posed along its path (see flight.ts).
      const t = this.flightTime(performance.now());
      const s = flightProgress(t, this.flight.direction);
      this.setFov(this.flightPath.pose(s, this.camera.position, this.camera.quaternion));
      this.dirty = false;
      this.render(true);
      this.flight.options.onFrame?.(s);
      if (t >= 1) this.endFlight();
      return;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  };

  /** `posed`: the camera was placed by a flight (otherwise from the orbit). */
  private render(posed = false): void {
    if (!posed) this.placeCamera();
    this.camera.updateMatrixWorld();
    const dist = this.camera.position.length();
    this.updateClipping(dist);
    this.blendSky();
    this.applyGlobes();
    this.globe3d.setCamera(this.camera.position);
    this.fadingGlobe.setCamera(this.camera.position);
    // Mix with zoom: engraved from afar, relief shows through when close.
    this.uniforms.uDetail.value = globeDetail(dist);
    // "You are here" (disc, zenith line) would surround the eye on the ground: shown from afar.
    this.observerMarker.visible = dist > 1.05;
    this.axis.visible = dist >= DIST_MIN;
    const guide = this.eclipticWeight();
    this.eclipticGuide.visible = guide > 0 && dist >= DIST_MIN;
    for (const m of this.guideMaterials) m.opacity = m.userData.opacity * guide;
    if (this.style === "realistic")
      this.real?.setCameraEarth(this.camera.position, this.earth.rotation.z);
    if (this.bodies) {
      const { sun, moon } = this.frameTmp;
      const s = this.screenOf(this.dirAt(0, sun));
      const [sx, sy] = s ? s : [NaN, NaN];
      const m = this.screenOf(this.dirAt(1, moon));
      if (s && m) this.uniforms.uSunAngle.value = Math.atan2(-(sy - m[1]), sx - m[0]);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  private dirAt(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
    return out.fromBufferAttribute(a, i);
  }

  /**
   * Screen position of a world point, or of a direction at infinity (w = 0). Allocation-free:
   * the returned pair is reused by the next call, so read it before projecting again.
   */
  private screenOf(p: THREE.Vector3, atInfinity = true): [number, number] | null {
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const { a: v, b: toCam, forward, point } = this.frameTmp;
    if (atInfinity) v.copy(p).multiplyScalar(1000).add(this.camera.position);
    else v.copy(p);
    toCam.copy(v).sub(this.camera.position);
    this.camera.getWorldDirection(forward);
    if (toCam.dot(forward) <= 0) return null;
    v.project(this.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    point[0] = ((v.x + 1) / 2) * w;
    point[1] = ((1 - v.y) / 2) * h;
    return point;
  }

  /**
   * True when the segment camera → world point (or the direction at infinity) passes through the
   * Earth's globe or a body's globe shown by the body-centred frame (#123).
   */
  private hiddenByEarth(p: THREE.Vector3, atInfinity: boolean): boolean {
    const cam = this.camera.position;
    const tmp = this.bodyTmp;
    if (hiddenBySphere(cam, p, atInfinity, ORIGIN, 1, tmp)) return true;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? this.globe3d : this.fadingGlobe;
      // A globe still smaller than its glyph (globeShown) does not hide anything yet.
      if (!g.object.visible || !this.isGlobe(bodyKind(g.getBody()))) continue;
      const r = bodyRadius(g.getBody());
      if (hiddenBySphere(cam, p, atInfinity, g.object.position, r, tmp)) return true;
    }
    return false;
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
    const { here, sun, moon, pole } = this.frameTmp;
    const [lon, lat] = [this.observer.longitude * DEG, this.observer.latitude * DEG];
    here
      .set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat))
      .multiplyScalar(1.3)
      .applyMatrix4(this.earth.matrixWorld);
    // On the ground (flight) the marker is hidden: its label would float overhead.
    if (this.observerMarker.visible) label(labels.here, here, false);
    if (this.bodies) {
      label(labels.sun, this.dirAt(0, sun), true, 20);
      if (this.ephemerisOk && !this.isGlobe(0))
        label(labels.moon, this.dirAt(1, moon), true, this.labelOffset(0, 18));
    }
    const names = this.options.planetNames;
    if (this.planetsShown() && this.planets && names) {
      font("700 10px", "0.12em");
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      const d = new THREE.Vector3();
      this.planets.forEach((p, i) => {
        if (!p || this.isGlobe(i + 1)) return;
        label(
          names[PLANETS[i]!],
          d.fromBufferAttribute(dirs, i),
          true,
          this.labelOffset(i + 1, 12),
        );
      });
    }
    font("700 11px", "0.12em");
    label(labels.pole, pole, true);
    // Ecliptic frame (#122): its pole, and the axis tilt beside the arc.
    if (this.eclipticGuide.visible && this.eclipticWeight() >= 0.5) {
      const { eclPole } = this.frameTmp;
      eclPole.set(0, 0, 1).applyQuaternion(this.eclipticGuide.quaternion);
      if (labels.eclipticPole) label(labels.eclipticPole, eclPole, true);
      const format = this.options.formatObliquity;
      if (format) {
        // Middle of the arc, ecliptic axes → world.
        const half = (this.obliquity * DEG) / 2;
        const mid = this.frameTmp.tilt
          .set(0, TILT_ARC * Math.sin(half), TILT_ARC * Math.cos(half))
          .applyQuaternion(this.eclipticGuide.quaternion);
        // Shown to 0.01°: formatted again only when it moves by more than 0.0001°.
        if (!(Math.abs(this.obliquityLabel.value - this.obliquity) < 1e-4))
          this.obliquityLabel = { value: this.obliquity, text: format(this.obliquity) };
        label(this.obliquityLabel.text, mid, false, 8);
      }
    }
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
    this.drawSelectionMarker();
  }

  /**
   * Engraved reticle around the selected star, Sun, Moon or planet (#103), as on the sky map;
   * none when the object is hidden behind the globe or not drawn. Allocation-free.
   */
  private drawSelectionMarker(): void {
    const marked = this.marked;
    if (!marked) return;
    const dir = this.frameTmp.marker;
    let radius = STAR_MARKER_RADIUS;
    if (marked.kind === "star") {
      // As the stars' shader: catalogue direction + uYears · proper motion, then precession.
      const { dirs, pm } = this.motion;
      const i = 3 * marked.index;
      const years = this.uniforms.uYears.value;
      dir
        .set(
          dirs[i]! + years * pm[i]!,
          dirs[i + 1]! + years * pm[i + 1]!,
          dirs[i + 2]! + years * pm[i + 2]!,
        )
        .normalize()
        .applyMatrix3(this.precession);
    } else if (marked.kind === "planet") {
      if (!this.planetsShown() || !this.planets?.[marked.index]) return;
      if (this.isGlobe(marked.index + 1)) return; // the globe itself is the mark
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      dir.fromBufferAttribute(dirs, marked.index);
      radius = this.labelOffset(marked.index + 1, STAR_MARKER_RADIUS + 2) - 2;
    } else {
      if (!this.bodies || (marked.kind === "moon" && !this.ephemerisOk)) return;
      if (marked.kind === "moon" && this.isGlobe(0)) return;
      this.dirAt(marked.kind === "sun" ? 0 : 1, dir);
      const disc = this.uniforms.uBodySize.value / 2 + MARKER_GAP;
      radius = marked.kind === "sun" ? disc : this.labelOffset(0, disc + 2) - 2;
    }
    if (this.hiddenByEarth(dir, true)) return;
    const s = this.screenOf(dir, true);
    if (!s) return;
    const ink = this.options.theme.ink;
    this.markerPattern = inkPattern(this.ctx, ink, this.markerPattern);
    drawMarker(this.ctx, s[0], s[1], radius, 1, ink, this.markerPattern.pattern);
    this.ctx.globalAlpha = 1;
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
    const onGlobe = this.pickGlobe(x, y);
    if (onGlobe) return onGlobe;
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
      if (this.ephemerisOk && !this.isGlobe(0))
        consider(this.dirAt(1), radius(0, r), { kind: "body", body: "Moon" });
    }
    if (this.planetsShown() && this.planets) {
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      this.planets.forEach((p, i) => {
        if (p && !this.isGlobe(i + 1))
          consider(new THREE.Vector3().fromBufferAttribute(dirs, i), radius(i + 1, 22), {
            kind: "planet",
            planet: PLANETS[i]!,
          });
      });
    }
    return best;
  }

  // --- Body-centred frame (#123)

  /**
   * Changes the frame, or the body of the body frame: the camera's pose now is frozen as the
   * start of the slerp; it ends on the new frame's orbit. Round the Earth the camera keeps its
   * place; into the body frame it goes to the body's default view; back from it, to where it was
   * round the Earth.
   */
  private changeFrame(id: ReferenceFrameId, body: BodyTarget, duration: number): void {
    if (this.stale) this.refresh();
    this.input.stopInertia();
    this.camTween = null;
    // The camera now (mid-transition included), frozen as the slerp's start.
    this.placeCamera();
    const state = this.frameTweenState;
    state.quat.copy(this.camera.quaternion);
    state.target.copy(this.poseTarget);
    const dist = this.camera.position.distanceTo(this.poseTarget);
    const from = this.frameId;
    const fromBody = from === "body" ? this.bodyFrame.body : null;
    if (!fromBody && id === "body") this.rememberEarthView();
    if (fromBody) {
      // The globe of the body left stays drawn during the transition.
      [this.globe3d, this.fadingGlobe] = [this.fadingGlobe, this.globe3d];
    }
    this.frameId = id;
    this.bodyFrame.body = body;
    this.globe3d.setBody(body);
    this.pendingBodyOrbit = false;
    const ms = id === "body" || fromBody ? Math.max(duration, BODY_TRANSITION_MS) : duration;
    this.frameTween =
      duration > 0 && !this.flight
        ? { from, fromBody, dist, start: performance.now(), duration: ms, k: 0, t: 0, ...state }
        : null;
    this.refresh(); // the new frame, positions and globes
    if (id === "body") this.orbit = this.bodyOrbit();
    else if (fromBody) this.orbit = this.earthOrbitBack();
    else {
      // Same camera position and target, expressed in the new frame.
      orbitInFrame(
        this.camera.position,
        this.poseTarget,
        this.frameQuat,
        this.frameOrigin,
        this.orbit,
      );
    }
    this.dirty = true;
  }

  /** After a flight out of the sky in the body frame: from the Earth's orbit to the body. */
  private tripFromEarth(duration: number): void {
    const state = this.frameTweenState;
    state.quat.copy(this.camera.quaternion);
    state.target.set(0, 0, 0); // the flight ends looking at the Earth's centre
    this.rememberEarthView();
    this.frameTween =
      duration > 0
        ? {
            from: "stars",
            fromBody: null,
            dist: this.camera.position.length(),
            start: performance.now(),
            duration,
            k: 0,
            t: 0,
            ...state,
          }
        : null;
    this.orbit = this.bodyOrbit();
    this.update();
  }

  private rememberEarthView(): void {
    this.earthReturn.dir.copy(this.camera.position).normalize();
    this.earthReturn.dist = this.camera.position.length();
  }

  /** Back round the Earth from a body: where the camera was before leaving, no pan. */
  private earthOrbitBack(): EarthOrbit {
    const at = directionInFrame(this.earthReturn.dir, this.frameQuat, { lon: 0, lat: 0 });
    const dist = Math.max(DIST_MIN, Math.min(DIST_MAX, this.earthReturn.dist));
    return { lon: at.lon, lat: Math.max(-89, Math.min(89, at.lat)), dist, tx: 0, ty: 0, tz: 0 };
  }

  /**
   * Default view of the body (body frame): 50° off the Sun towards the Earth, raised towards
   * the pole, at a distance where it fills the screen (bodyViewDirection, bodyViewDistance).
   */
  private bodyOrbit(): EarthOrbit {
    if (this.stale) this.refresh();
    const body = this.bodyFrame.body;
    const dist = bodyViewDistance(body, ORBIT_FOV, this.camera.aspect);
    if (!this.worldPosOk) return { lon: 0, lat: 20, dist, tx: 0, ty: 0, tz: 0 };
    const { a: sun, b: toEarth, c: pole, d: dir } = this.bodyTmp;
    const centre = this.worldPos[bodyKind(body) + 1]!;
    sun.copy(this.worldPos[0]!).sub(centre).normalize();
    toEarth.copy(centre).negate().normalize();
    bodyPole(body, this.precession, pole);
    bodyViewDirection(sun, toEarth, pole, dir);
    const at = directionInFrame(dir, this.frameQuat, { lon: 0, lat: 0 });
    return { lon: at.lon, lat: Math.max(-89, Math.min(89, at.lat)), dist, tx: 0, ty: 0, tz: 0 };
  }

  /** Radius (Earth radii) of the frame's target: the body in the body frame, else the Earth. */
  private radius(): number {
    return this.frameId === "body" ? bodyRadius(this.bodyFrame.body) : 1;
  }

  private distMin(): number {
    return DIST_MIN * this.radius();
  }

  private distMax(): number {
    return DIST_MAX * this.radius();
  }

  /** Centre (world) of the frame's target: the body's globe, or the Earth's. */
  private targetCentre(): THREE.Vector3 {
    return this.frameId === "body" ? this.globe3d.object.position : ORIGIN;
  }

  /** Weight of the body frame: 1 in it, blended during a transition to or from it. */
  private bodyWeight(): number {
    const tw = this.frameTween;
    const on = this.frameId === "body" ? 1 : 0;
    if (!tw) return on;
    const was = tw.fromBody ? 1 : 0;
    return was + (on - was) * tw.k;
  }

  /**
   * Positions of the Sun, the Moon and the planets (world, Earth radii), and the globes' poses,
   * while the body frame is shown or being left. Date-dependent: run by refresh().
   */
  private refreshBodies(prec: THREE.Matrix3): void {
    const tw = this.frameTween;
    const inFrame = this.frameId === "body";
    const leaving = !!tw?.fromBody && (!inFrame || tw.fromBody !== this.bodyFrame.body);
    this.globe3d.setVisible(inFrame);
    this.fadingGlobe.setVisible(leaving);
    this.worldPosOk = false;
    if (!inFrame && !leaving) return;
    worldPosition("Sun", this.date, prec, this.worldPos[0]!);
    for (let k = 0; k < BODY_TARGETS.length; k++)
      worldPosition(BODY_TARGETS[k]!, this.date, prec, this.worldPos[k + 1]!);
    this.worldPosOk = true;
    if (inFrame) this.poseGlobe(this.globe3d, prec);
    if (leaving) this.poseGlobe(this.fadingGlobe, prec);
  }

  /** A globe at its body's position, lit from the Sun, its axes as the sprites' (space-style). */
  private poseGlobe(globe: BodyGlobe, prec: THREE.Matrix3): void {
    const body = globe.getBody();
    const centre = this.worldPos[bodyKind(body) + 1]!;
    const { a: sun, b: pole, c: prime } = this.bodyTmp;
    sun.copy(this.worldPos[0]!).sub(centre).normalize();
    bodyPole(body, prec, pole);
    if (body === "Moon") {
      // Near side towards the Earth (moonAxes): the prime meridian at the sub-Earth point.
      prime.copy(centre).negate().normalize();
      prime.addScaledVector(pole, -prime.dot(pole)).normalize();
    } else {
      const [x, y, z] = planetAxes(body, this.date).prime;
      prime.set(x, y, z).applyMatrix3(prec).normalize();
    }
    globe.setPose(centre, sun, pole, prime);
  }

  /**
   * The globe stands for its body once its disc is at least GLOBE_MIN_PX in radius: farther (at
   * the start of a trip to Saturn, at true scale it is a fraction of a pixel), the body keeps
   * its glyph and label.
   */
  private globeShown(globe: BodyGlobe): boolean {
    if (!globe.object.visible) return false;
    const d = this.camera.position.distanceTo(globe.object.position);
    const r = bodyRadius(globe.getBody());
    const focalPx = this.options.canvas.clientHeight / 2 / Math.tan((this.camera.fov * DEG) / 2);
    return d <= r || (r / Math.sqrt(d * d - r * r)) * focalPx >= GLOBE_MIN_PX;
  }

  /** Kind 0 (Moon) or 1 … 7 (planets) drawn as a globe now: its glyph and label are hidden. */
  private isGlobe(kind: number): boolean {
    return kind === this.globeKindA || kind === this.globeKindB;
  }

  /** Hides the glyphs of the bodies drawn as globes (engraved and realistic), once per change. */
  private applyGlobes(): void {
    const a = this.globeShown(this.globe3d) ? bodyKind(this.globe3d.getBody()) : -1;
    const b = this.globeShown(this.fadingGlobe) ? bodyKind(this.fadingGlobe.getBody()) : -1;
    if (this.globesApplied && a === this.globeKindA && b === this.globeKindB) return;
    this.globesApplied = true;
    this.globeKindA = a;
    this.globeKindB = b;
    this.real?.setGlobeBodies(a, b);
    // Sun = point 0, Moon = point 1 (hidden out of the ephemeris range, or as a globe).
    this.bodyPoints.geometry.setDrawRange(0, this.ephemerisOk && !this.isGlobe(0) ? 2 : 1);
    const mags = this.planetPoints.geometry.getAttribute("aMag") as THREE.BufferAttribute;
    for (let i = 0; i < PLANETS.length; i++)
      mags.setX(i, this.isGlobe(i + 1) ? 99 : this.planetMags[i]!);
    mags.needsUpdate = true;
  }

  /**
   * Sky glyphs of the Sun, the Moon and the planets: seen from the camera in the body frame
   * (positions minus the camera: from Jupiter the Sun is 5° from where the Earth sees it),
   * geocentric otherwise, blended during a transition. Allocation-free.
   */
  private blendSky(): void {
    const w = this.worldPosOk ? this.bodyWeight() : 0;
    if (w === 0 && !this.skyBlended) return;
    const out = this.bodyTmp.sky;
    const real = this.real;
    const bodyDirs = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
    for (let i = 0; i < 2; i++) {
      this.blendDir(this.geoBodyDirs, i, this.worldPos[i]!, w, out);
      bodyDirs.setXYZ(i, out.x, out.y, out.z);
      if (real && i === 0) real.setSunDirection(out);
      else if (real) real.setDirection(0, out);
    }
    bodyDirs.needsUpdate = true;
    const planetDirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
    for (let j = 0; j < PLANETS.length; j++) {
      this.blendDir(this.geoPlanetDirs, j, this.worldPos[j + 2]!, w, out);
      planetDirs.setXYZ(j, out.x, out.y, out.z);
      real?.setDirection(j + 1, out);
    }
    planetDirs.needsUpdate = true;
    this.skyBlended = w > 0;
  }

  private blendDir(
    geo: Float32Array,
    i: number,
    position: THREE.Vector3,
    w: number,
    out: THREE.Vector3,
  ): void {
    out.set(geo[3 * i]!, geo[3 * i + 1]!, geo[3 * i + 2]!);
    if (w === 0) return;
    const rel = this.bodyTmp.rel.copy(position).sub(this.camera.position).normalize();
    out
      .multiplyScalar(1 - w)
      .addScaledVector(rel, w)
      .normalize();
  }

  /**
   * Near and far planes: the near plane half-way to the closest surface (the Earth's, or a body
   * globe's), at most 0.01 round the Earth as before; the far plane beyond the Earth and the
   * globes (the sky sits on it whatever its distance).
   */
  private updateClipping(earthDist: number): void {
    let surface = earthDist - 1;
    let far = Math.max(100, earthDist + 2);
    let globes = false;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? this.globe3d : this.fadingGlobe;
      if (!g.object.visible) continue;
      globes = true;
      const r = bodyRadius(g.getBody());
      const d = this.camera.position.distanceTo(g.object.position);
      surface = Math.min(surface, d - r);
      far = Math.max(far, d + 3 * r);
    }
    // Near the ground (flight) the ground below the eye is closer than the usual near plane.
    const near = Math.max(1e-4, Math.min(globes ? Infinity : 0.01, surface * 0.5));
    if (near !== this.camera.near || far !== this.camera.far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Tap on the globe of the body orbited: that body. */
  private pickGlobe(x: number, y: number): SkySelection | null {
    if (this.frameId !== "body" || !this.globe3d.object.visible) return null;
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const o = this.camera.position;
    const dir = this.bodyTmp.d
      .set((2 * x) / Math.max(1, w) - 1, 1 - (2 * y) / Math.max(1, h), 0.5)
      .unproject(this.camera)
      .sub(o)
      .normalize();
    const c = this.globe3d.object.position;
    const body = this.globe3d.getBody();
    const t = raySphere(o.x - c.x, o.y - c.y, o.z - c.z, dir.x, dir.y, dir.z, bodyRadius(body));
    if (t < 0) return null;
    return body === "Moon" ? { kind: "body", body: "Moon" } : { kind: "planet", planet: body };
  }

  private zoom(factor: number): void {
    const requested = this.orbit.dist * factor;
    this.orbit.dist = Math.max(this.distMin(), Math.min(this.distMax(), requested));
    this.dirty = true;
    // Zooming in past the closest distance on "you are here": into the sky (#37). Not round
    // another body.
    if (
      this.frameId === "body" ||
      !this.options.onEnterSky ||
      !this.overZoom.push(DIST_MIN / requested, performance.now())
    )
      return;
    this.placeCamera();
    const gst = greenwichMeanSiderealTime(this.date);
    horizonBasis(this.observer.latitude, this.observer.longitude, gst, this.horizon);
    if (shouldEnterSky(this.camera.position, this.horizon.up)) this.options.onEnterSky();
  }
}
