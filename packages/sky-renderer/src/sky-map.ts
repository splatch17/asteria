import * as THREE from "three";
import {
  applyMat3,
  j2000ToHorizontalMatrix,
  multiplyMat3,
  unitVector,
  type Mat3,
  type Observer,
  type Vec3,
} from "@asteria/astro-core";
import { groundFrag, groundVert, lineFrag, lineVert, starFrag, starVert } from "./shaders";
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
  ground: string;
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
  onSelect?: (star: CatalogStar | null) => void;
}

const FOV_MIN = 2;
const FOV_MAX = 150;
const FRICTION = 0.9;

const toThreeMat3 = (m: Mat3) => new THREE.Matrix3().set(...m);
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Faintest magnitude displayed for a given field of view. */
export function limitingMagnitude(fov: number): number {
  return Math.min(6.5, Math.max(4.6, 5.0 + 2.2 * Math.log10(90 / fov)));
}

export class SkyMap {
  readonly view: ViewState = { azimuth: 180, altitude: 35, fov: 100 };
  private observer: Observer = { latitude: 48.8566, longitude: 2.3522 };
  private date = new Date();
  private showLines = true;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uniforms;
  private readonly lineMesh: THREE.LineSegments;
  private readonly starDirs: Vec3[];
  private readonly labels: { text: string; dir: Vec3 }[];
  private eq2hor: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private dirty = true;
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
      uInk: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uLineOpacity: { value: 0.45 },
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

    this.scene.add(this.lineMesh, starPoints, ground);

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

  setTheme(theme: SkyTheme): void {
    this.uniforms.uInk.value.set(theme.ink);
    this.uniforms.uGround.value.set(theme.ground);
    this.renderer.setClearColor(theme.sky);
    this.options.theme = theme;
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
    this.dirty = true;
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
    if (this.dirty) {
      this.dirty = false;
      this.render();
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
    this.uniforms.uLimitMag.value = limitingMagnitude(this.view.fov);
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  private toScreen(v: Vec3): [number, number] | null {
    if (v[2] < 0.05) return null;
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

    // Constellation names
    if (this.showLines) {
      ctx.globalAlpha = 0.55;
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.letterSpacing = "0.18em";
      ctx.textAlign = "center";
      for (const { text, dir } of this.labels) {
        if (!aboveHorizon(dir)) continue;
        const p = this.toScreen(applyMat3(m, dir));
        if (p) ctx.fillText(text.toUpperCase(), p[0], p[1]);
      }
    }

    // Bright star names (more appear when zooming in)
    const maxMag = this.view.fov > 90 ? 1.2 : this.view.fov > 45 ? 2.2 : 3.5;
    ctx.globalAlpha = 0.8;
    ctx.font = "400 10px 'JetBrains Mono', monospace";
    ctx.letterSpacing = "0.08em";
    ctx.textAlign = "left";
    stars.forEach((s, i) => {
      if (!s.name || s.v > maxMag) return;
      const d = this.starDirs[i]!;
      if (!aboveHorizon(d)) return;
      const p = this.toScreen(applyMat3(m, d));
      if (p) ctx.fillText(s.name, p[0] + 9, p[1]);
    });

    // Cardinal points on the horizon
    if (cardinals) {
      ctx.globalAlpha = 0.9;
      ctx.font = "700 13px 'JetBrains Mono', monospace";
      ctx.letterSpacing = "0.1em";
      ctx.textAlign = "center";
      cardinals.forEach((label, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const p = this.toScreen(applyMat3(view, [Math.cos(a), Math.sin(a), 0]));
        if (p) ctx.fillText(label, p[0], p[1] + 16);
      });
    }
    ctx.globalAlpha = 1;
  }

  private pick(x: number, y: number): CatalogStar | null {
    const m = this.eqToView();
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
    return best;
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

      if (this.pointers.size === 1) {
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
