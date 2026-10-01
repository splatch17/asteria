import * as THREE from "three";
import {
  PLANETS,
  applyMat3,
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
  lineFrag,
  lineVert,
  pathFrag,
  pathVert,
  planetFrag,
  planetVert,
  starFrag,
  starVert,
} from "./shaders";
import { LabelLayout } from "./labels";
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

/** Apparent path of a planet, sampled regularly (a mark is drawn at each new month). */
export interface SkyPath {
  name: Planet;
  points: { date: Date; ra: number; dec: number }[];
}

export type SkySelection =
  | { kind: "star"; star: CatalogStar }
  | { kind: "body"; body: BodyName }
  | { kind: "planet"; planet: Planet };

/** At night, planets are hidden this many magnitudes later than stars (they are never lost). */
export const PLANET_DAYLIGHT_MARGIN = 4;

/** Daylight cap on planet magnitudes: (Sun altitude in degrees, faintest magnitude) nodes. */
const PLANET_DAY_CAP: readonly (readonly [number, number])[] = [
  [-18, 10],
  [-6, 1.0],
  [0, -2.0],
  [10, -3.4],
];

/**
 * Faintest planet magnitude shown, from the stars' limiting magnitude and the Sun's altitude.
 *
 * Night: the stars' limit + PLANET_DAYLIGHT_MARGIN. As the Sun rises, a daylight cap takes over,
 * linear between these (Sun altitude → magnitude) nodes:
 *   −18° → 10 (no cap: fainter than Neptune)
 *   −6° → 1.0 (end of civil twilight: Mercury, Saturn, Mars, Jupiter)
 *   0° → −2.0 (sunrise: Jupiter still, Mercury gone) · ≥ +10° → −3.4 (full day: Venus only)
 * −3.4 sits between Jupiter's brightest (−2.9) and Venus's faintest (−3.8), so with the Sun high
 * only Venus remains, and Jupiter only shows in twilight.
 */
export function planetLimitingMagnitude(starLimit: number, sunAltitude: number): number {
  const nodes = PLANET_DAY_CAP;
  let cap = sunAltitude <= nodes[0]![0] ? nodes[0]![1] : nodes.at(-1)![1];
  for (let i = 1; i < nodes.length; i++) {
    const [a0, m0] = nodes[i - 1]!;
    const [a1, m1] = nodes[i]!;
    if (sunAltitude > a0 && sunAltitude <= a1) {
      cap = m0 + ((m1 - m0) * (sunAltitude - a0)) / (a1 - a0);
      break;
    }
  }
  return Math.min(starLimit + PLANET_DAYLIGHT_MARGIN, cap);
}

export interface SkyMapOptions {
  canvas: HTMLCanvasElement;
  /** 2D canvas stacked on top, used for labels. */
  overlay: HTMLCanvasElement;
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
}

const FOV_MIN = 2;
const FOV_MAX = 200;
const FRICTION = 0.9;

const toThreeMat3 = (m: Mat3) => new THREE.Matrix3().set(...m);
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Faintest magnitude displayed for a given field of view. */
export function limitingMagnitude(fov: number): number {
  return Math.min(6.5, Math.max(4.6, 5.0 + 2.2 * Math.log10(90 / fov)));
}

/** On-screen radius (CSS px) of a planet's disc, mirroring planetVert. */
function planetRadius(p: { name: Planet; magnitude: number }): number {
  const size = Math.min(20, Math.max(7, 11 - p.magnitude * 1.6));
  return (size * (p.name === "Saturn" ? 1.6 : 1)) / 2;
}

export class SkyMap {
  readonly view: ViewState = { azimuth: 180, altitude: 35, fov: 100, roll: 0 };
  private observer: Observer = { latitude: 48.8566, longitude: 2.3522 };
  private date = new Date();
  private showLines = true;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uniforms;
  private readonly lineMesh: THREE.LineSegments;
  private readonly bodyPoints: THREE.Points;
  private bodies: { sun: Vec3; moon: Vec3; illumination: number } | null = null;
  private readonly planetPoints: THREE.Points;
  /** Current planets, in PLANETS order (direction and magnitude), null when unset. */
  private planets: { name: Planet; dir: Vec3; magnitude: number }[] | null = null;
  private showPlanets = true;
  private readonly pathPoints: THREE.Points;
  private pathMarks: { dir: Vec3; text: string; width: number }[] = [];
  private showPaths = true;
  /** 0 = dark night … 1 = full daylight, from the Sun's altitude. */
  private daylight = 0;
  private sunAltitude = -90;
  private readonly starDirs: Vec3[];
  private readonly labels: { text: string; dir: Vec3 }[];
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
    for (const polys of Object.values(lines)) {
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = byHip.get(poly[i]!);
          const b = byHip.get(poly[i + 1]!);
          if (a && b) segs.push(...a, ...b);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    lineGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(segs, 3));
    this.lineMesh = new THREE.LineSegments(lineGeo, this.material(lineVert, lineFrag, false));
    this.lineMesh.frustumCulled = false;

    // Ground (full-screen, drawn last so it hides what is below the horizon)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material(groundVert, groundFrag, false),
    );
    ground.frustumCulled = false;

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

    // Apparent paths (dotted; buffers sized by setPaths)
    this.pathPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      this.material(pathVert, pathFrag, false),
    );
    this.pathPoints.frustumCulled = false;
    this.pathPoints.visible = false;

    this.scene.add(
      this.lineMesh,
      this.pathPoints,
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
        text: options.constellationNames?.[abbr] ?? abbr,
        dir: [c[0] / n, c[1] / n, c[2] / n],
      };
    });

    this.setTheme(options.theme);
    this.bindInput(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.updateSky();
    this.loop();
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
    this.planetPoints.visible = this.showPlanets && !!this.planets;
    this.dirty = true;
  }

  /** Apparent paths of the planets; a mark (and a dated label) at each new month. */
  setPaths(paths: SkyPath[] | null): void {
    this.pathMarks = [];
    const total = paths?.reduce((n, p) => n + p.points.length, 0) ?? 0;
    const geo = this.pathPoints.geometry;
    let dirs = geo.getAttribute("aDir") as THREE.BufferAttribute | undefined;
    let marks = geo.getAttribute("aMark") as THREE.BufferAttribute | undefined;
    if (!dirs || !marks || dirs.count < total) {
      // Headroom so that sliding windows keep reusing the same buffers.
      const capacity = Math.max(1024, Math.ceil(total * 1.25));
      dirs = new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3);
      marks = new THREE.Float32BufferAttribute(new Float32Array(capacity), 1);
      geo.setAttribute("position", dirs);
      geo.setAttribute("aDir", dirs);
      geo.setAttribute("aMark", marks);
    }
    let k = 0;
    for (const path of paths ?? []) {
      let month = -1;
      for (const pt of path.points) {
        const d = unitVector(pt.ra, pt.dec);
        const m = pt.date.getMonth();
        const mark = month >= 0 && m !== month;
        month = m;
        dirs.setXYZ(k, d[0], d[1], d[2]);
        marks.setX(k, mark ? 1 : 0);
        if (mark && this.options.formatPathMark)
          this.pathMarks.push({ dir: d, text: this.options.formatPathMark(pt.date), width: -1 });
        k++;
      }
    }
    dirs.needsUpdate = true;
    marks.needsUpdate = true;
    geo.setDrawRange(0, total);
    this.pathPoints.visible = this.showPaths && total > 0;
    this.dirty = true;
  }

  setPlanetsVisible(visible: boolean): void {
    this.showPlanets = visible;
    this.planetPoints.visible = visible && !!this.planets;
    this.dirty = true;
  }

  setPathsVisible(visible: boolean): void {
    this.showPaths = visible;
    this.pathPoints.visible = visible && this.pathPoints.geometry.drawRange.count > 0;
    this.dirty = true;
  }

  setLinesVisible(visible: boolean): void {
    this.showLines = visible;
    this.lineMesh.visible = visible;
    this.dirty = true;
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
    this.updateDaylight();
    this.dirty = true;
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
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const [nx, ny] = projectStereo(v, stereoScale(this.view.fov), w / h);
    if (Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return null;
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h];
  }

  private drawLabels(): void {
    const { ctx } = this;
    const { canvas, stars, cardinals, theme } = this.options;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = "middle";
    const m = this.eqToView();
    const view = viewMatrix(this.view);
    const aboveHorizon = (d: Vec3) => applyMat3(this.eq2hor, d)[2] > 0;
    // Labels are placed by priority; a label that collides with every fallback is dropped.
    const layout = new LabelLayout();
    const H = 12;

    // 1. Cardinal points on the horizon
    if (cardinals) {
      this.setLabelFont("700 13px", "0.1em", 0.9);
      cardinals.forEach((label, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const p = this.toScreen(applyMat3(view, [Math.cos(a), Math.sin(a), 0]));
        if (!p) return;
        const w = ctx.measureText(label).width;
        const r = layout.place([{ x: p[0] - w / 2, y: p[1] + 16 - H / 2, w, h: H }]);
        if (r) ctx.fillText(label, r.x, r.y + H / 2);
      });
    }

    // 2. Sun and Moon
    if (this.bodies && this.options.bodyNames) {
      this.setLabelFont("700 11px", "0.12em", 0.95);
      const offset = this.uniforms.uBodySize.value / 2 + 6;
      for (const [body, dir] of [
        ["Sun", this.bodies.sun],
        ["Moon", this.bodies.moon],
      ] as const) {
        if (!aboveHorizon(dir)) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (!p) continue;
        // The disc itself is occupied: later labels (path dates…) must not cover it.
        const half = offset - 6;
        layout.place([{ x: p[0] - half, y: p[1] - half, w: 2 * half, h: 2 * half }]);
        const label = this.options.bodyNames[body].toUpperCase();
        const w = ctx.measureText(label).width;
        const r = layout.place([
          { x: p[0] + offset, y: p[1] - H / 2, w, h: H },
          { x: p[0] - offset - w, y: p[1] - H / 2, w, h: H },
        ]);
        if (r) ctx.fillText(label, r.x, r.y + H / 2);
      }
    }

    // 3. Planets (those daylight leaves visible)
    if (this.showPlanets && this.planets && this.options.planetNames) {
      this.setLabelFont("700 10px", "0.12em", 0.9);
      for (const p of this.planets) {
        if (!this.planetVisible(p.magnitude) || !aboveHorizon(p.dir)) continue;
        const pos = this.toScreen(applyMat3(m, p.dir));
        if (!pos) continue;
        const label = this.options.planetNames[p.name].toUpperCase();
        const w = ctx.measureText(label).width;
        const off = planetRadius(p) + 5;
        const [x, y] = pos;
        layout.place([{ x: x - off + 5, y: y - off + 5, w: 2 * off - 10, h: 2 * off - 10 }]);
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
    const visibleLimit = limitingMagnitude(this.view.fov) - this.daylight * 7 - 1;
    const maxMag = Math.min(
      visibleLimit,
      this.view.fov > 90 ? 1.2 : this.view.fov > 45 ? 2.2 : 3.5,
    );
    this.setLabelFont("400 10px", "0.08em", 0.8);
    stars.forEach((s, i) => {
      if (!s.name || s.v > maxMag) return;
      const d = this.starDirs[i]!;
      if (!aboveHorizon(d)) return;
      const p = this.toScreen(applyMat3(m, d));
      if (!p) return;
      const w = ctx.measureText(s.name).width;
      const [x, y] = p;
      const r = layout.place([
        { x: x + 9, y: y - H / 2, w, h: H }, // right
        { x: x - 9 - w, y: y - H / 2, w, h: H }, // left
        { x: x - w / 2, y: y - 8 - H, w, h: H }, // above
        { x: x - w / 2, y: y + 8, w, h: H }, // below
      ]);
      if (r) ctx.fillText(s.name, r.x, r.y + H / 2);
    });

    // 5. Constellation names
    if (this.showLines) {
      this.setLabelFont("500 10px", "0.18em", 0.55);
      for (const { text, dir } of this.labels) {
        if (!aboveHorizon(dir)) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (!p) continue;
        const label = text.toUpperCase();
        const w = ctx.measureText(label).width;
        const [x, y] = p;
        const r = layout.place(
          [0, -16, 16, -32, 32].map((dy) => ({ x: x - w / 2, y: y + dy - H / 2, w, h: H })),
        );
        if (r) ctx.fillText(label, r.x, r.y + H / 2);
      }
    }
    // 6. Dates of the monthly marks on the planets' paths (lowest priority)
    if (this.showPaths && this.pathMarks.length) {
      this.setLabelFont("400 9px", "0.06em", 0.6);
      const h = 10;
      for (const mark of this.pathMarks) {
        const { dir, text } = mark;
        if (!aboveHorizon(dir)) continue;
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
    if (this.pointing) this.drawReticle();
    ctx.globalAlpha = 1;
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

  /** Same rule as planetVert (see planetLimitingMagnitude). */
  private planetVisible(magnitude: number): boolean {
    return magnitude <= this.uniforms.uPlanetLimit.value;
  }

  private setLabelFont(weightSize: string, spacing: string, alpha: number): void {
    this.ctx.font = `${weightSize} 'JetBrains Mono', monospace`;
    this.ctx.letterSpacing = spacing;
    this.ctx.textAlign = "left";
    this.ctx.globalAlpha = alpha;
  }

  private pick(x: number, y: number): SkySelection | null {
    const m = this.eqToView();
    if (this.bodies) {
      const radius = Math.max(22, this.uniforms.uBodySize.value / 2);
      for (const [body, dir] of [
        ["Moon", this.bodies.moon],
        ["Sun", this.bodies.sun],
      ] as const) {
        if (applyMat3(this.eq2hor, dir)[2] < 0) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (p && Math.hypot(p[0] - x, p[1] - y) < radius) return { kind: "body", body };
      }
    }
    if (this.showPlanets && this.planets) {
      let found: Planet | null = null;
      let bestDist = Infinity;
      for (const pl of this.planets) {
        if (!this.planetVisible(pl.magnitude) || applyMat3(this.eq2hor, pl.dir)[2] < 0) continue;
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
      const p = this.toScreen(applyMat3(m, this.starDirs[i]!));
      if (!p) return;
      const score = Math.hypot(p[0] - x, p[1] - y) - (limit - s.v) * 1.5;
      if (score < bestScore) [best, bestScore] = [s, score];
    });
    return best ? { kind: "star", star: best } : null;
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

      if (this.pointers.size === 1 && !this.pointing) {
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
