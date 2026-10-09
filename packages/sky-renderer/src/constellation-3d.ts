/**
 * Constellation 3D view (#8): the figure's stars at their real distances, the Earth at the
 * origin, distance rings in light-years; render on demand. Gestures (#107, gesture-input.ts):
 * one finger orbits round the target point with inertia, two fingers pan it, pinch-zoom towards
 * the point between them and roll the view; double tap centres a star (or resets the view). Opens with an animated transition from the sky map's own view
 * (same stereographic projection, same orientation) that unfolds the depth, and closes with the
 * reverse.
 *
 * Loaded on demand (`@asteria/sky-renderer/constellation-3d`): not part of the start-up bundle.
 * Stars are drawn by WebGL (constellation-3d-shaders.ts); lines and labels on a 2D overlay, with
 * the same projection (projectPose, constellation-3d-model.ts).
 */
import * as THREE from "three";
import type { Mat3, Vec3 } from "@asteria/astro-core";
import {
  PHASES,
  dragOrbit,
  ease,
  fitOrbitDistance,
  orbitPose,
  panOrbit,
  planTransition,
  rollOrbitAbout,
  poseAt,
  projectPose,
  scaleRings,
  type Constellation3DModel,
  type OrbitState,
  type Pose,
  type Projected,
  type ScreenBand,
  type Star3D,
  type TransitionPlan,
  zoomOrbit,
} from "./constellation-3d-model";
import { GestureInput } from "./gesture-input";
import { easeOut, panScale, wrapDegrees } from "./gestures";
import { star3dFrag, star3dVert } from "./constellation-3d-shaders";
import { LabelLayout, type Rect } from "./labels";
import { disposeObjects, watchContext } from "./lifecycle";
import type { CatalogStar } from "./sky-map";
import { bvToRgb } from "./space-style";
import type { ViewState } from "./view";

export * from "./constellation-3d-model";

/** Audience level (ART_DIRECTION: Découverte shows less data, Expert the uncertainties). */
export type Level3D = "discovery" | "amateur" | "expert";

export interface Constellation3DTheme {
  ink: string;
  sky: string;
}

/** Texts of a star's label, from the UI (i18n). */
export interface StarLabel3D {
  name: string;
  /** Distance line, e.g. "≈ 1 400 al"; empty to hide it. */
  distance: string;
}

export interface Constellation3DOptions<S extends CatalogStar> {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  model: Constellation3DModel<S>;
  /** The sky map's view when the 3D view opens: the transition starts from it. */
  startView: ViewState;
  theme: Constellation3DTheme;
  /** Night vision: no B−V colours. */
  monochrome: boolean;
  level: Level3D;
  label: (star: Star3D<S>, level: Level3D) => StarLabel3D;
  /** Ring graduation, e.g. "500 al". */
  formatRing: (ly: number) => string;
  /** Name of the origin, e.g. "Soleil · Terre". */
  originLabel: string;
  /** Transition duration (ms) for one way; 0 jumps (reduced motion). */
  duration?: number;
  onSelect?: (index: number | null) => void;
}

/** Final angles of the transition: seen from above and to the side, so depth reads at once. */
export const DEFAULT_ORBIT_ANGLES = { yaw: 38, pitch: 48 } as const;
const PITCH_LIMIT = 85;
/** Zoom range around the fitted distance. */
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
/** The target may be panned this far from the pivot, in scene radii (the Earth is one away). */
const PAN_LIMIT = 1.2;
/** Duration of the recentring and reset tweens, ms. */
const RECENTRE_MS = 450;
const PICK_RADIUS = 28;
const NAME_FONT = "600 11px";
const DISTANCE_FONT = "400 10px";

const RAD = Math.PI / 180;
const toThreeMat3 = (m: Mat3, out: THREE.Matrix3) => out.set(...m);
const srgb = (css: string): THREE.Vector3 => {
  const c = new THREE.Color(css).getRGB(new THREE.Color(), THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** Apparent radius (CSS px) of a star's core, mirroring star3dVert (gap of the figure lines). */
function coreRadius(v: number): number {
  const size = Math.min(34, Math.max(7, 3.2 * Math.sqrt(10 ** (-0.4 * (v - 5.5)))));
  return size * 0.36;
}

export class Constellation3DView<S extends CatalogStar = CatalogStar> {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uniforms;
  private readonly model: Constellation3DModel<S>;
  private plan!: TransitionPlan;
  /** Orbit reached at the end of the transition (and moved by the user). */
  private orbit: OrbitState = { yaw: 0, pitch: 0, distance: 1 };
  private fitted = 1;
  /** Transition progress: 0 = the sky map's view, 1 = the 3D view. */
  private t = 0;
  private tween: {
    from: number;
    to: number;
    start: number;
    duration: number;
    done: () => void;
  } | null = null;
  private pose!: Pose;
  private level: Level3D;
  private theme: Constellation3DTheme;
  private monochrome: boolean;
  private selected: number | null = null;
  private hud: readonly Rect[] = [];
  private band: ScreenBand | undefined;
  private size = { w: 1, h: 1 };
  private dirty = true;
  private raf = 0;
  private contextLost = false;
  private readonly listeners = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private input!: GestureInput;
  /** Animated move of the orbit (recentre, reset), eased; null when none. */
  private camTween: { from: Required<OrbitState>; to: Required<OrbitState>; start: number } | null =
    null;
  /** Largest distance of a drawn point (stars, the Earth) from the pivot, ly. */
  private sceneRadius = 1;
  private lastFrame = 0;
  /** Screen positions of the stars in the last frame (CSS px), null when not drawn. */
  private screen: ({ x: number; y: number } | null)[];
  private readonly rings: number[];
  /** Half-angle of the ring arcs around the line of sight, radians. */
  private readonly ringSpan: number;
  private pattern: { ink: string; pattern: CanvasPattern | null } | null = null;
  private readonly scratch: Projected = { x: 0, y: 0, depth: 0 };
  /** Current label font (setFont) and cached text widths. */
  private font = "";
  private readonly widths = new Map<string, number>();
  private readonly labelCache = new Map<
    Level3D,
    { name: string; distance: string; nw: number; dw: number }[]
  >();
  private readonly labelOrder: number[] = [];

  constructor(private readonly options: Constellation3DOptions<S>) {
    const { canvas, overlay, model } = options;
    this.model = model;
    this.level = options.level;
    this.theme = options.theme;
    this.monochrome = options.monochrome;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.ctx = overlay.getContext("2d")!;
    this.screen = model.stars.map(() => null);

    this.uniforms = {
      uStereoRot: { value: new THREE.Matrix3() },
      uStereoScale: { value: 1 },
      uMorph: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uCamRot: { value: new THREE.Matrix3() },
      uFocal: { value: 1 },
      uShiftY: { value: 0 },
      uAspect: { value: 1 },
      uDpr: { value: this.renderer.getPixelRatio() },
      uInk: { value: srgb(this.theme.ink) },
      uTint: { value: 0 },
      uAlpha: { value: 1 },
    };

    const n = model.stars.length;
    const position = new Float32Array(3 * n);
    const mag = new Float32Array(n);
    const color = new Float32Array(3 * n);
    const flag = new Float32Array(n);
    model.stars.forEach((s, i) => {
      position.set(s.position, 3 * i);
      mag[i] = s.star.v;
      color.set(bvToRgb(s.star.bv), 3 * i);
      flag[i] = s.uncertain ? 2 : s.distance?.quality === "approx" ? 1 : 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    geometry.setAttribute("aFlag", new THREE.BufferAttribute(flag, 1));
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: star3dVert,
        fragmentShader: star3dFrag,
        uniforms: this.uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    this.scene.add(points);

    let far = 0;
    for (const s of model.stars) far = Math.max(far, s.placedLy);
    this.rings = scaleRings(far);
    let theta = 0;
    for (const s of model.stars) {
      const c =
        s.dir[0] * model.centre[0] + s.dir[1] * model.centre[1] + s.dir[2] * model.centre[2];
      theta = Math.max(theta, Math.acos(Math.min(1, c)));
    }
    this.ringSpan = Math.min(Math.PI / 2, Math.max(30 * RAD, theta + 25 * RAD));

    this.applyTheme();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.input = new GestureInput(canvas, this.gestures(), this.listeners.signal);
    watchContext(canvas, this.listeners.signal, {
      lost: () => (this.contextLost = true),
      restored: () => {
        this.contextLost = false;
        this.requestRender();
      },
    });
    // Widths measured with a fallback font are dropped once the label font is there.
    document.fonts?.ready.then(() => {
      this.widths.clear();
      this.labelCache.clear();
      this.requestRender();
    });
  }

  // --- public API

  /** Plays the transition 2D → 3D; resolves when the 3D view is reached. */
  open(): Promise<void> {
    return this.animateTo(1);
  }

  /** Plays the reverse transition back to the sky map's view; resolves at its end. */
  close(): Promise<void> {
    this.selected = null;
    this.settle();
    return this.animateTo(0);
  }

  /** Back to the figure as seen from the Earth (centred), or forward to the 3D view. */
  fromEarth(on: boolean): Promise<void> {
    if (on) this.settle();
    return this.animateTo(on ? PHASES.centre : 1);
  }

  /** Transition progress (0 = sky map, 1 = 3D). */
  get progress(): number {
    return this.t;
  }

  /** Freezes the transition at `t` (captures, tests). */
  setProgress(t: number): void {
    this.tween = null;
    this.t = Math.min(1, Math.max(0, t));
    this.requestRender();
  }

  /** Sets the orbit's angles (degrees) and zoom (1 = fitted distance). */
  setOrbit({ yaw, pitch, zoom }: { yaw?: number; pitch?: number; zoom?: number }): void {
    if (yaw !== undefined) this.orbit.yaw = yaw;
    if (pitch !== undefined)
      this.orbit.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    if (zoom !== undefined) this.orbit.distance = this.fitted * zoom;
    this.requestRender();
  }

  /**
   * Back to the view the transition ended on (angles, fitted distance, no pan nor roll),
   * animated unless `instant`.
   */
  resetView(instant = false): void {
    const { yaw, pitch } = DEFAULT_ORBIT_ANGLES;
    this.moveTo({ yaw, pitch, distance: this.fitted, roll: 0, target: [0, 0, 0] }, instant);
  }

  /** Centres the view on a star of the figure (pans to it), angles and distance kept. */
  centreOn(index: number, instant = false): void {
    const s = this.model.stars[index];
    if (!s) return;
    const p = this.plan.frame.pivot;
    this.moveTo(
      {
        ...this.fullOrbit(),
        target: [s.position[0] - p[0], s.position[1] - p[1], s.position[2] - p[2]],
      },
      instant,
    );
  }

  setTheme(theme: Constellation3DTheme, monochrome: boolean): void {
    this.theme = theme;
    this.monochrome = monochrome;
    this.applyTheme();
    this.requestRender();
  }

  setLevel(level: Level3D): void {
    this.level = level;
    this.applyTheme();
    this.requestRender();
  }

  setSelected(index: number | null): void {
    this.selected = index;
    this.requestRender();
  }

  /** Screen areas (CSS px) covered by the interface, where no label is written. */
  setHudExclusions(rects: readonly Rect[]): void {
    this.hud = rects;
    // The scene is framed in the free band between the blocks above and below the middle.
    const { h } = this.size;
    let top = 0;
    let bottom = h;
    for (const r of rects) {
      if (r.y + r.h / 2 < h / 2) top = Math.max(top, r.y + r.h);
      else bottom = Math.min(bottom, r.y);
    }
    const band =
      bottom - top > h * 0.25
        ? { top: 1 - (2 * top) / h, bottom: 1 - (2 * bottom) / h }
        : undefined;
    this.band = band;
    this.replan();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.tween?.done();
    this.tween = null;
    disposeObjects(this.scene);
    this.renderer.dispose();
  }

  // --- internals

  /** Stops every motion and wraps the angles, before a transition unwinds them. */
  private settle(): void {
    this.input.stopInertia();
    this.camTween = null;
    this.orbit.yaw = wrapDegrees(this.orbit.yaw);
    this.orbit.roll = wrapDegrees(this.orbit.roll ?? 0);
  }

  private fullOrbit(): Required<OrbitState> {
    const o = this.orbit;
    return {
      yaw: o.yaw,
      pitch: o.pitch,
      distance: o.distance,
      roll: o.roll ?? 0,
      target: o.target ? [o.target[0], o.target[1], o.target[2]] : [0, 0, 0],
    };
  }

  private moveTo(to: Required<OrbitState>, instant: boolean): void {
    this.input.stopInertia();
    const from = this.fullOrbit();
    // Shortest way round.
    to.yaw = from.yaw + wrapDegrees(to.yaw - from.yaw);
    to.roll = from.roll + wrapDegrees(to.roll - from.roll);
    if (instant || this.options.duration === 0 || this.t < 1) {
      this.orbit = to;
      this.camTween = null;
    } else this.camTween = { from, to, start: performance.now() };
    this.requestRender();
  }

  /** Orbit at time `now` of the recentring tween; true while it runs. */
  private stepCamTween(now: number): boolean {
    const tw = this.camTween;
    if (!tw) return false;
    const k = easeOut((now - tw.start) / RECENTRE_MS);
    const { from: a, to: b } = tw;
    const o = this.orbit;
    const t = (o.target ??= [0, 0, 0]);
    o.yaw = a.yaw + (b.yaw - a.yaw) * k;
    o.pitch = a.pitch + (b.pitch - a.pitch) * k;
    o.roll = a.roll + (b.roll - a.roll) * k;
    o.distance = a.distance * (b.distance / a.distance) ** k;
    for (let i = 0; i < 3; i++) t[i] = a.target[i]! + (b.target[i]! - a.target[i]!) * k;
    this.dirty = true;
    if (k >= 1) this.camTween = null;
    return k < 1;
  }

  /** Gesture intents (CSS px) mapped onto the orbit. */
  private gestures() {
    const interactive = () => this.t >= 1 && !this.tween;
    return {
      enabled: interactive,
      grab: () => {
        this.camTween = null;
      },
      orbit: (dx: number, dy: number) => {
        // Grab the scene: dragging right turns it to the right (the camera goes left).
        dragOrbit(this.orbit, dx, dy, 180 / Math.max(320, this.size.w), PITCH_LIMIT);
        this.requestRender();
      },
      pan: (dx: number, dy: number) => {
        const k = panScale(this.orbit.distance, this.plan.focal, this.size.h);
        panOrbit(this.orbit, this.pose.camRot, dx, dy, k, this.panLimit());
        this.requestRender();
      },
      zoom: (factor: number, x: number, y: number) => {
        const { w, h } = this.size;
        zoomOrbit(
          this.orbit,
          this.pose.camRot,
          factor,
          (2 * x) / w - 1,
          1 - (2 * y) / h - this.plan.shiftY,
          w / h,
          this.plan.focal,
          this.fitted * ZOOM_MIN,
          this.fitted * ZOOM_MAX,
          this.panLimit(),
        );
        this.requestRender();
      },
      roll: (rad: number, x: number, y: number) => {
        // About the point between the fingers; the image centre is shifted into the free band.
        const { w, h } = this.size;
        const k = panScale(this.orbit.distance, this.plan.focal, h);
        const cy = ((1 - this.plan.shiftY) / 2) * h;
        rollOrbitAbout(this.orbit, this.pose.camRot, rad, x - w / 2, y - cy, k, this.panLimit());
        this.requestRender();
      },
      tap: (x: number, y: number) => {
        const hit = this.pick(x, y);
        this.selected = hit;
        this.options.onSelect?.(hit);
        this.requestRender();
      },
      // The first tap has selected the star (or nothing): selecting can resize the legend
      // and reframe the scene, so the second tap may no longer be over the same star.
      doubleTap: () => {
        if (this.selected === null) this.resetView();
        else this.centreOn(this.selected);
      },
      changed: () => this.requestRender(),
    };
  }

  private panLimit(): number {
    return PAN_LIMIT * this.sceneRadius;
  }

  private applyTheme(): void {
    this.uniforms.uInk.value.copy(srgb(this.theme.ink));
    // B−V colours: discreet, never at night nor in Découverte (ART_DIRECTION §2).
    this.uniforms.uTint.value = this.monochrome || this.level === "discovery" ? 0 : 0.4;
  }

  private animateTo(to: number): Promise<void> {
    this.tween?.done();
    const duration = (this.options.duration ?? 2600) * Math.abs(to - this.t);
    if (duration < 1) {
      this.t = to;
      this.tween = null;
      this.requestRender();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tween = { from: this.t, to, start: performance.now(), duration, done: resolve };
      this.requestRender();
    });
  }

  private resize(): void {
    const { canvas, overlay } = this.options;
    const first = !this.plan;
    // Not laid out yet: the window's size stands in until the observer reports the real one.
    const w = canvas.clientWidth || (first ? innerWidth : 0);
    const h = canvas.clientHeight || (first ? innerHeight : 0);
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.font = ""; // resizing the canvas resets its context state
    this.uniforms.uAspect.value = w / h;
    this.replan();
  }

  /** The plan and the fitted distance depend on the screen; angles and zoom are kept. */
  private replan(): void {
    const first = !this.plan;
    const aspect = this.size.w / this.size.h;
    const zoom = first ? 1 : this.orbit.distance / this.fitted;
    this.plan = planTransition(this.model, this.options.startView, aspect, this.band);
    const points: Vec3[] = [[0, 0, 0], ...this.model.stars.map((s) => s.position)];
    const { yaw, pitch } = DEFAULT_ORBIT_ANGLES;
    this.fitted = fitOrbitDistance(this.plan, points, yaw, pitch, aspect);
    const pivot = this.plan.frame.pivot;
    this.sceneRadius = Math.max(
      1,
      ...points.map((p) => Math.hypot(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2])),
    );
    if (first) this.orbit = { yaw, pitch, distance: this.fitted };
    else this.orbit.distance = this.fitted * zoom;
    this.requestRender();
  }

  private requestRender(): void {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    let more = false;
    if (this.tween) {
      const { from, to, start, duration } = this.tween;
      const k = Math.min(1, (now - start) / duration);
      this.t = from + (to - from) * k;
      if (k >= 1) {
        const done = this.tween.done;
        this.tween = null;
        done();
      } else more = true;
      this.dirty = true;
    }
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    // Inertia of the orbit (calls the orbit gesture), then the recentring tween.
    if (this.input.step(dt)) more = true;
    if (this.stepCamTween(now)) more = true;
    if (this.dirty && !this.contextLost) {
      this.dirty = false;
      this.render();
    }
    if (more) this.raf = requestAnimationFrame(this.frame);
  };

  /** Opacity of the 3D context (rings, sight lines, the Earth, distances): unfolds with depth. */
  private unfold(): number {
    return ease((this.t - PHASES.morph) / 0.22);
  }

  private render(): void {
    const t = this.t;
    this.pose = t >= 1 ? orbitPose(this.plan, this.orbit) : poseAt(this.plan, t, this.orbit);
    const u = this.uniforms;
    toThreeMat3(this.pose.stereoRot, u.uStereoRot.value);
    u.uStereoScale.value = this.pose.stereoScale;
    u.uMorph.value = this.pose.morph;
    u.uCamPos.value.set(...this.pose.camPos);
    toThreeMat3(this.pose.camRot, u.uCamRot.value);
    u.uFocal.value = this.pose.focal;
    u.uShiftY.value = this.pose.shiftY;
    // The background fades in first: at t = 0 the figure lies exactly on the sky map's stars.
    this.renderer.setClearColor(this.theme.sky, ease(t / 0.16));
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
  }

  /** CSS px position of a point, null when behind the camera. Reuses one scratch object. */
  private toScreen(p: Vec3): Projected | null {
    const q = projectPose(this.pose, p, this.size.w / this.size.h, this.scratch);
    if (!q) return null;
    q.x = ((q.x + 1) / 2) * this.size.w;
    q.y = ((1 - q.y) / 2) * this.size.h;
    return q;
  }

  private point(dir: Vec3, ly: number): { x: number; y: number } | null {
    const q = this.toScreen([dir[0] * ly, dir[1] * ly, dir[2] * ly]);
    return q && { x: q.x, y: q.y };
  }

  private drawOverlay(): void {
    const { ctx, model } = this;
    const { w, h } = this.size;
    const ink = this.theme.ink;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "butt";
    this.screen = model.stars.map((s) => {
      const q = this.toScreen(s.position);
      return q && { x: q.x, y: q.y };
    });
    const unfold = this.unfold();
    const layout = new LabelLayout(this.hud);
    // Star discs are not covered by labels.
    this.screen.forEach((p, i) => {
      if (!p) return;
      const r = coreRadius(model.stars[i]!.star.v) - 1;
      layout.occupy({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r });
    });

    if (unfold > 0) {
      this.drawRings(unfold);
      this.drawSightLines(unfold);
      this.drawUncertainties(unfold);
    }
    this.drawFigure();
    if (unfold > 0) this.drawOrigin(unfold, layout);
    this.drawSelection();
    this.drawLabels(unfold, layout);
    if (unfold > 0) this.drawRingLabels(unfold, layout);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  /** Distance rings round the Earth, in the plane of the line of sight and the screen's right. */
  private drawRings(alpha: number): void {
    const { ctx } = this;
    const { forward: f, right: r } = this.plan.frame;
    const steps = 48;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.32 * alpha;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const radius of this.rings) {
      let pen = false;
      for (let k = 0; k <= steps; k++) {
        const phi = -this.ringSpan + (2 * this.ringSpan * k) / steps;
        const c = Math.cos(phi) * radius;
        const s = Math.sin(phi) * radius;
        const q = this.toScreen([c * f[0] + s * r[0], c * f[1] + s * r[1], c * f[2] + s * r[2]]);
        if (!q) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
        pen = true;
      }
    }
    ctx.stroke();
    // The ruler: from the Earth along the line of sight, up to the last ring.
    const last = this.rings.at(-1) ?? 0;
    const a = this.point(f, 0.001);
    const b = this.point(f, last);
    if (a && b) {
      ctx.globalAlpha = 0.6 * alpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  private drawRingLabels(alpha: number, layout: LabelLayout): void {
    const { ctx } = this;
    const { forward: f } = this.plan.frame;
    this.setFont("500 10px", alpha * 0.8);
    for (const radius of this.rings) {
      const p = this.point(f, radius);
      if (!p) continue;
      const text = this.options.formatRing(radius);
      const tw = this.measure(text);
      const candidates = [
        { x: p.x + 6, y: p.y - 6, w: tw, h: 12 },
        { x: p.x - tw - 6, y: p.y - 6, w: tw, h: 12 },
        { x: p.x + 6, y: p.y + 2, w: tw, h: 12 },
      ];
      const rect = layout.place(candidates.filter((c) => this.inside(c)));
      if (rect) ctx.fillText(text, rect.x, rect.y + 10);
      // Tick across the ruler.
      ctx.globalAlpha = 0.6 * alpha;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.globalAlpha = alpha * 0.8;
    }
  }

  /** Lines of sight from the Earth: every star of the figure is seen along one of them. */
  private drawSightLines(alpha: number): void {
    const { ctx, model } = this;
    const o = this.toScreen([0, 0, 0]);
    if (!o) return;
    const ox = o.x;
    const oy = o.y;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45 * alpha;
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    model.stars.forEach((s, i) => {
      const p = this.screen[i];
      if (!p) return;
      ctx.moveTo(ox, oy);
      ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Uncertainty along the line of sight. Uncertain stars (σϖ/ϖ > 0.5): dashed segment over their
   * ±1σ range, open-ended when unbounded, at every level. Expert: ±1σ bars with end caps for all.
   */
  private drawUncertainties(alpha: number): void {
    const { ctx, model } = this;
    const limit = model.limitLy;
    const expert = this.level === "expert";
    model.stars.forEach((s) => {
      const d = s.distance;
      if (!d) return;
      if (!s.uncertain && !expert) return;
      if (!(d.farLy > d.nearLy)) return;
      const near = Math.min(d.nearLy, limit);
      const far = Math.min(d.farLy, limit);
      const a = this.point(s.dir, Math.max(near, 0.001));
      const b = this.point(s.dir, far);
      if (!a || !b) return;
      const open = d.farLy > limit;
      ctx.globalAlpha = (s.uncertain ? 0.75 : 0.9) * alpha;
      ctx.lineWidth = s.uncertain ? 1.25 : 1.5;
      ctx.setLineDash(s.uncertain ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Caps perpendicular to the bar on screen; an open end gets a chevron (unbounded).
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 2) return;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const cap = 4;
      ctx.beginPath();
      ctx.moveTo(a.x - nx * cap, a.y - ny * cap);
      ctx.lineTo(a.x + nx * cap, a.y + ny * cap);
      if (open) {
        const tx = (b.x - a.x) / len;
        const ty = (b.y - a.y) / len;
        ctx.moveTo(b.x - tx * cap + nx * cap, b.y - ty * cap + ny * cap);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x - tx * cap - nx * cap, b.y - ty * cap - ny * cap);
      } else {
        ctx.moveTo(b.x - nx * cap, b.y - ny * cap);
        ctx.lineTo(b.x + nx * cap, b.y + ny * cap);
      }
      ctx.stroke();
    });
  }

  /** Figure lines as an engraved stroke (1-bit checkerboard band, solid core), gaps at stars. */
  private drawFigure(): void {
    const { ctx, model } = this;
    const ink = this.theme.ink;
    if (this.pattern?.ink !== ink) {
      const tile = document.createElement("canvas");
      tile.width = tile.height = 2;
      const g = tile.getContext("2d")!;
      g.fillStyle = ink;
      g.fillRect(0, 0, 1, 1);
      g.fillRect(1, 1, 1, 1);
      this.pattern = { ink, pattern: ctx.createPattern(tile, "repeat") };
    }
    ctx.beginPath();
    for (const [i, j] of model.segments) {
      const a = this.screen[i];
      const b = this.screen[j];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ga = coreRadius(model.stars[i]!.star.v) + 4;
      const gb = coreRadius(model.stars[j]!.star.v) + 4;
      if (len <= ga + gb) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      ctx.moveTo(a.x + ux * ga, a.y + uy * ga);
      ctx.lineTo(b.x - ux * gb, b.y - uy * gb);
    }
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.strokeStyle = this.pattern.pattern ?? ink;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  /** The Sun and the Earth at the origin: ⊕ glyph and its name. */
  private drawOrigin(alpha: number, layout: LabelLayout): void {
    const { ctx } = this;
    const o = this.toScreen([0, 0, 0]);
    if (!o) return;
    const { x, y } = o;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    layout.occupy({ x: x - 8, y: y - 8, w: 16, h: 16 });
    const text = this.options.originLabel;
    this.setFont("600 10px", alpha);
    const tw = this.measure(text);
    const rect = layout.place(
      [
        { x: x - tw / 2, y: y + 10, w: tw, h: 12 },
        { x: x + 10, y: y - 6, w: tw, h: 12 },
        { x: x - tw - 10, y: y - 6, w: tw, h: 12 },
        { x: x - tw / 2, y: y - 22, w: tw, h: 12 },
      ].filter((c) => this.inside(c)),
    );
    if (rect) ctx.fillText(text, rect.x, rect.y + 10);
  }

  private drawSelection(): void {
    const i = this.selected;
    const p = i === null ? null : this.screen[i];
    if (i === null || !p) return;
    const { ctx } = this;
    const r = coreRadius(this.model.stars[i]!.star.v) + 7;
    const k = r * 0.45;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      ctx.moveTo(p.x + sx * r, p.y + sy * (r - k));
      ctx.lineTo(p.x + sx * r, p.y + sy * r);
      ctx.lineTo(p.x + sx * (r - k), p.y + sy * r);
    }
    ctx.stroke();
  }

  /** Names (and, as depth unfolds, distances), brightest first, without overlaps. */
  private drawLabels(unfold: number, layout: LabelLayout): void {
    const { ctx, model } = this;
    // With the background: at t = 0 the sky map's own names are visible underneath.
    const fade = ease(this.t / 0.16);
    if (fade <= 0) return;
    const texts = this.labelTexts();
    const order = this.labelOrder;
    order.length = 0;
    for (let i = 0; i < model.stars.length; i++) if (this.screen[i]) order.push(i);
    order.sort((a, b) =>
      a === this.selected
        ? -1
        : b === this.selected
          ? 1
          : model.stars[a]!.star.v - model.stars[b]!.star.v,
    );
    // Placement first, then one font per pass (font changes are costly on a canvas).
    const placed: { i: number; x: number; y: number; right: boolean }[] = [];
    for (const i of order) {
      const s = model.stars[i]!;
      const p = this.screen[i]!;
      const { name, distance, nw, dw } = texts[i]!;
      const showDistance = unfold > 0 && distance !== "";
      if (!name && !showDistance) continue;
      const tw = Math.max(nw, showDistance ? dw : 0);
      const th = showDistance && name ? 25 : 13;
      const r = coreRadius(s.star.v) + 4;
      const candidates: Rect[] = [
        { x: p.x + r, y: p.y - th / 2, w: tw, h: th },
        { x: p.x - r - tw, y: p.y - th / 2, w: tw, h: th },
        { x: p.x - tw / 2, y: p.y - r - th, w: tw, h: th },
        { x: p.x - tw / 2, y: p.y + r, w: tw, h: th },
      ].filter((c) => this.inside(c));
      const rect = layout.place(candidates);
      if (!rect) continue;
      const right = rect.x + tw <= p.x; // label on the left: right-aligned texts
      placed.push({ i, x: right ? rect.x + tw : rect.x, y: rect.y, right });
    }
    this.setFont(NAME_FONT, fade);
    for (const { i, x, y, right } of placed) {
      const { name } = texts[i]!;
      if (!name) continue;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillText(name, x, y + 10);
    }
    if (unfold > 0) {
      this.setFont(DISTANCE_FONT, unfold * 0.85 * fade);
      for (const { i, x, y, right } of placed) {
        const { name, distance } = texts[i]!;
        if (!distance) continue;
        ctx.textAlign = right ? "right" : "left";
        ctx.fillText(distance, x, y + (name ? 23 : 10));
      }
    }
    ctx.textAlign = "left";
  }

  /** Label texts and widths for the current level, computed once per level (i18n is costly). */
  private labelTexts(): { name: string; distance: string; nw: number; dw: number }[] {
    const cached = this.labelCache.get(this.level);
    if (cached) return cached;
    const texts = this.model.stars.map((s) => {
      const { name, distance } = this.options.label(s, this.level);
      return { name, distance, nw: 0, dw: 0 };
    });
    this.setFont(NAME_FONT, 1);
    for (const t of texts) t.nw = t.name ? this.ctx.measureText(t.name).width : 0;
    this.setFont(DISTANCE_FONT, 1);
    for (const t of texts) t.dw = t.distance ? this.ctx.measureText(t.distance).width : 0;
    this.labelCache.set(this.level, texts);
    return texts;
  }

  private inside(r: Rect): boolean {
    return r.x >= 4 && r.y >= 4 && r.x + r.w <= this.size.w - 4 && r.y + r.h <= this.size.h - 4;
  }

  /** Sets the label font (only when it changes: parsing a font is costly) and the opacity. */
  private setFont(weightSize: string, alpha: number): void {
    if (weightSize !== this.font) {
      this.font = weightSize;
      this.ctx.font = `${weightSize} 'JetBrains Mono', monospace`;
      this.ctx.letterSpacing = "0.04em";
    }
    this.ctx.globalAlpha = alpha;
  }

  /** Width of a text in the current font, cached (ring and origin labels). */
  private measure(text: string): number {
    const key = `${this.font}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) this.widths.set(key, (w = this.ctx.measureText(text).width));
    return w;
  }

  private pick(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = PICK_RADIUS;
    this.screen.forEach((p, i) => {
      if (!p) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
}
