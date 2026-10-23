/**
 * The flat all-sky map of the latitude explorer (#188), on a 2D canvas: equirectangular in the
 * equator of date (right ascension growing to the left, 0 h on the right edge), so that the
 * three zones of a latitude are horizontal bands: the cap that never sets in fine dots, the cap
 * that never rises in diagonal hatching (the same patterns as the sphere, LatitudeSphere), the
 * band that rises and sets clear. Over it, the IAU boundaries (hairlines), the figures, the bright
 * stars, the limit parallels ±(90° − |φ|) with their values, the selected constellation cut out
 * of the dither and outlined.
 *
 * Everything but the bands is fixed for a date: boundaries, figures and stars are projected once
 * (`setSky`) and drawn from flat arrays; a latitude change re-dithers one value per row.
 */
import { applyMat3, type Mat3, type Vec3 } from "@asteria/astro-core";
import {
  mapRaDec,
  mapSegment,
  mapX,
  mapY,
  raDecOf,
  unwrapRing,
  type MapFrame,
} from "./latitude-geometry";
import { zoneInk, type LatitudeTheme } from "./latitude-sphere";

/** What the map shows of the sky, J2000 unit vectors. */
export interface MapSky {
  /** Boundary rings by IAU abbreviation (constellation-bounds `boundsOutline`). */
  outlines: Readonly<Record<string, Vec3[][]>>;
  /** Figure segments by abbreviation. */
  segments: Readonly<Record<string, [Vec3, Vec3][]>>;
  stars: readonly { dir: Vec3; v: number }[];
}

export interface LatitudeMapLabels {
  /** Value of the circumpolar limit (« +41,1° ») and of the other one. */
  upperLimit?: string;
  lowerLimit?: string;
  /** Declination ticks (« +60° », …) and hours (« 0 h », …) along the edges; empty: none. */
  decTicks?: { dec: number; text: string }[];
  hourTicks?: { ra: number; text: string }[];
  /** The declination of the zenith (= latitude), on the left edge. */
  zenith?: string;
  /** Name of the selected constellation, written at `selectedAt`. */
  selected?: string;
}

const segmentsOf = (f: MapFrame, a: Vec3, b: Vec3) => mapSegment(f, raDecOf(a), raDecOf(b));

export class LatitudeMap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly buffer = document.createElement("canvas");
  private readonly bufferCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private theme: LatitudeTheme = { ink: "#f0e6d2", sky: "#101b52" };
  private lat = 48.85;
  private precession: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private sky: MapSky = { outlines: {}, segments: {}, stars: [] };
  /** Projected sky (CSS px of the current size), rebuilt on size or date change. */
  private boundaryPath: Path2D | null = null;
  private figurePath: Path2D | null = null;
  private starRects: Float32Array = new Float32Array(0);
  private selected: string | null = null;
  private selectedRings: [number, number][][] = [];
  private selectedFigure: Path2D | null = null;
  private selectedAt: [number, number] | null = null;
  private labels: LatitudeMapLabels = {};
  private shadedKey = "";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    const bctx = this.buffer.getContext("2d");
    if (!ctx || !bctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bufferCtx = bctx;
  }

  get frame(): MapFrame {
    return { width: this.width, height: this.height };
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.dpr = Math.min(3, Math.max(1, dpr));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.project();
  }
  setTheme(theme: LatitudeTheme): void {
    this.theme = theme;
  }
  setLatitude(lat: number): void {
    this.lat = Math.max(-90, Math.min(90, lat));
  }
  setSky(sky: MapSky, precession: Mat3): void {
    this.sky = sky;
    this.precession = precession;
    this.project();
  }
  setSelected(abbr: string | null): void {
    this.selected = abbr;
    this.projectSelected();
  }
  setLabels(labels: LatitudeMapLabels): void {
    this.labels = labels;
  }

  /** J2000 direction under a CSS pixel of the map. */
  pick(x: number, y: number): Vec3 {
    const { ra, dec } = mapRaDec(this.frame, x, y);
    const [a, d] = [(ra * Math.PI) / 180, (dec * Math.PI) / 180];
    const v: Vec3 = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
    const m = this.precession;
    // Equator of date → J2000: the transpose of the precession.
    return [
      m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
      m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
      m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
    ];
  }

  private ofDate = (v: Vec3): Vec3 => applyMat3(this.precession, v);

  private project(): void {
    const f = this.frame;
    const boundaries = new Path2D();
    for (const rings of Object.values(this.sky.outlines))
      for (const ring of rings)
        for (let i = 0; i + 1 < ring.length; i++)
          for (const [x0, y0, x1, y1] of segmentsOf(
            f,
            this.ofDate(ring[i]!),
            this.ofDate(ring[i + 1]!),
          )) {
            boundaries.moveTo(x0, y0);
            boundaries.lineTo(x1, y1);
          }
    this.boundaryPath = boundaries;
    const figures = new Path2D();
    for (const segs of Object.values(this.sky.segments))
      for (const [a, b] of segs)
        for (const [x0, y0, x1, y1] of segmentsOf(f, this.ofDate(a), this.ofDate(b))) {
          figures.moveTo(x0, y0);
          figures.lineTo(x1, y1);
        }
    this.figurePath = figures;
    const rects = new Float32Array(this.sky.stars.length * 3);
    this.sky.stars.forEach((s, i) => {
      const { ra, dec } = raDecOf(this.ofDate(s.dir));
      rects[i * 3] = mapX(f, ra);
      rects[i * 3 + 1] = mapY(f, dec);
      rects[i * 3 + 2] = s.v < 1 ? 2 : s.v < 2.5 ? 1.5 : 1;
    });
    this.starRects = rects;
    this.projectSelected();
  }

  private projectSelected(): void {
    const f = this.frame;
    const abbr = this.selected;
    this.selectedRings = [];
    this.selectedFigure = null;
    this.selectedAt = null;
    if (!abbr || !this.sky.outlines[abbr]) return;
    let best = -Infinity;
    for (const ring of this.sky.outlines[abbr]!) {
      const pts = ring.map((v) => raDecOf(this.ofDate(v)));
      const poly = unwrapRing(f, pts);
      this.selectedRings.push(poly);
      // The label goes at the middle of the widest ring's extent, kept on the map.
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      if (w > best) {
        best = w;
        let x = (Math.max(...xs) + Math.min(...xs)) / 2;
        x = ((x % f.width) + f.width) % f.width;
        this.selectedAt = [x, (Math.max(...ys) + Math.min(...ys)) / 2];
      }
    }
    const fig = new Path2D();
    for (const [a, b] of this.sky.segments[abbr] ?? [])
      for (const [x0, y0, x1, y1] of segmentsOf(f, this.ofDate(a), this.ofDate(b))) {
        fig.moveTo(x0, y0);
        fig.lineTo(x1, y1);
      }
    this.selectedFigure = fig;
  }

  /** Draws a frame; returns its cost in ms. */
  draw(): number {
    if (!this.width || !this.height) return 0; // not laid out yet
    const t0 = performance.now();
    const { ctx, dpr, width: W, height: H } = this;
    const ink = this.theme.ink;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme.sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.shade();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, W * dpr, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";

    // The selected area cut out of the zones' dither, so that its outline and figure stand out.
    if (this.selectedRings.length) {
      ctx.fillStyle = this.theme.sky;
      for (const shift of [-W, 0, W]) {
        ctx.beginPath();
        for (const ring of this.selectedRings)
          ring.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
        ctx.closePath();
        ctx.fill("evenodd");
      }
      ctx.fillStyle = ink;
    }

    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 0.6;
    if (this.boundaryPath) ctx.stroke(this.boundaryPath);
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.7;
    if (this.figurePath) ctx.stroke(this.figurePath);
    ctx.globalAlpha = 1;
    const r = this.starRects;
    for (let i = 0; i < r.length; i += 3) {
      const s = r[i + 2]!;
      const x = Math.round(r[i]! * dpr) / dpr;
      const y = Math.round(r[i + 1]! * dpr) / dpr;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }

    if (this.selectedRings.length) {
      ctx.lineWidth = 1.4;
      for (const shift of [-W, 0, W]) {
        ctx.beginPath();
        for (const ring of this.selectedRings)
          ring.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.lineWidth = 1.1;
      if (this.selectedFigure) ctx.stroke(this.selectedFigure);
    }

    this.drawLimits();
    this.drawLabels();
    return performance.now() - t0;
  }

  /** One ink value per row: the zones are bands of declination. */
  private shade(): void {
    const { width: W, height: H } = this;
    const key = `${this.lat.toFixed(3)}|${W}x${H}|${this.theme.ink}`;
    if (key === this.shadedKey) return;
    this.shadedKey = key;
    this.buffer.width = W;
    this.buffer.height = H;
    const image = this.bufferCtx.createImageData(W, H);
    const px = new Uint32Array(image.data.buffer);
    const hex = this.theme.ink.replace(/^#/, "");
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const n = Number.parseInt(full.slice(0, 6), 16);
    const ink =
      ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
    const limit = 90 - Math.abs(this.lat);
    const pole = this.lat > 1e-9 ? 1 : this.lat < -1e-9 ? -1 : 0;
    for (let y = 0; y < H; y++) {
      const dec = 90 - ((y + 0.5) / H) * 180;
      const s = dec * pole;
      const zone = pole === 0 ? 0 : s > limit ? 1 : s < -limit ? 2 : 0;
      if (!zone) continue;
      for (let x = 0; x < W; x++) if (zoneInk(zone, x, y, 1)) px[y * W + x] = ink;
    }
    this.bufferCtx.putImageData(image, 0, 0);
  }

  private drawLimits(): void {
    const { ctx, width: W } = this;
    const f = this.frame;
    const limit = 90 - Math.abs(this.lat);
    // Celestial equator, dashed.
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, mapY(f, 0));
    ctx.lineTo(W, mapY(f, 0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (Math.abs(this.lat) < 0.05) return;
    ctx.lineWidth = 1.1;
    for (const d of [limit, -limit]) {
      const y = Math.round(mapY(f, d) * this.dpr) / this.dpr;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  private drawLabels(): void {
    const { ctx, width: W, height: H } = this;
    const f = this.frame;
    const L = this.labels;
    ctx.font = "500 9px 'JetBrains Mono', ui-monospace, monospace";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0.6px";
    const text = (
      s: string,
      x: number,
      y: number,
      align: CanvasTextAlign,
      base: CanvasTextBaseline,
      alpha = 1,
    ) => {
      ctx.globalAlpha = alpha;
      ctx.textAlign = align;
      ctx.textBaseline = base;
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.theme.sky;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = this.theme.ink;
      ctx.fillText(s, x, y);
      ctx.globalAlpha = 1;
    };
    for (const t of L.decTicks ?? []) text(t.text, 3, mapY(f, t.dec), "left", "middle", 0.7);
    for (const t of L.hourTicks ?? []) text(t.text, mapX(f, t.ra), H - 3, "center", "bottom", 0.7);
    const limit = 90 - Math.abs(this.lat);
    if (Math.abs(this.lat) >= 0.05) {
      // Values on the right edge, on the side of each limit's cap.
      const north = this.lat > 0;
      const upperY = mapY(f, limit);
      const lowerY = mapY(f, -limit);
      if (L.upperLimit && upperY > 8)
        text(L.upperLimit, W - 3, upperY + (north ? -2 : 2), "right", north ? "bottom" : "top");
      if (L.lowerLimit && lowerY < H - 8)
        text(L.lowerLimit, W - 3, lowerY + (north ? 2 : -2), "right", north ? "top" : "bottom");
    }
    if (L.zenith) {
      const y = mapY(f, this.lat);
      ctx.beginPath();
      ctx.moveTo(0, y - 3.5);
      ctx.lineTo(5, y);
      ctx.lineTo(0, y + 3.5);
      ctx.closePath();
      ctx.fillStyle = this.theme.ink;
      ctx.fill();
      text(L.zenith, 8, y, "left", "middle");
    }
    if (L.selected && this.selectedAt) {
      const [x, y] = this.selectedAt;
      ctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace";
      const clampedX = Math.min(W - 4, Math.max(4, x));
      const align: CanvasTextAlign = x < 50 ? "left" : x > W - 50 ? "right" : "center";
      text(L.selected.toUpperCase(), clampedX, Math.min(H - 10, Math.max(10, y)), align, "middle");
    }
  }
}
