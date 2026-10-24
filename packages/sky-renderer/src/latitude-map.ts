/**
 * The flat all-sky map of the latitude explorer (#188), on a 2D canvas: equirectangular in the
 * equator of date (right ascension growing to the left, 0 h on the right edge), so that the
 * three zones of a latitude are horizontal bands: the cap that never sets and the one that never
 * rises in translucent washes (#197, the same as the sphere's, LatitudeSphere), the band that
 * rises and sets clear. Over them, the IAU boundaries (hairlines), the figures, the bright stars,
 * the limit parallels ±(90° − |φ|) with their values, the selected constellation outlined.
 *
 * View (#197): the map fills its canvas at zoom 1 when the canvas is 2:1; a taller or wider
 * canvas (the enlarged map) shows a world at least as tall and as wide as it, 2:1, that pans
 * (around the sky without end in right ascension, within the poles in declination) and zooms.
 *
 * Everything but the bands is fixed for a date and a view: boundaries, figures and stars are
 * projected once (`setSky`) and rasterised into a cached layer with a margin around the view, so
 * that a frame of the latitude sweep, a drag or a pinch only paints two bands, the cached layer
 * (moved or scaled) and a few lines and labels.
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
import { DEFAULT_WASHES, washColor, type LatitudeTheme } from "./latitude-sphere";

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
  /** Declination ticks (« +60° », …) on the right edge and hours (« 0 h », …) along the bottom;
   * empty: none. */
  decTicks?: { dec: number; text: string }[];
  hourTicks?: { ra: number; text: string }[];
  /** The declination of the zenith (= latitude), on the right edge. */
  zenith?: string;
  /** Name of the selected constellation, written at its middle. */
  selected?: string;
}

/** Largest zoom of the enlarged map: about a constellation across a phone. */
export const MAP_MAX_ZOOM = 6;

const segmentsOf = (f: MapFrame, a: Vec3, b: Vec3) => mapSegment(f, raDecOf(a), raDecOf(b));

export class LatitudeMap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /**
   * The boundaries, figures and stars, rasterised for a view and a margin around it, and blitted:
   * a drag or a pinch moves or scales the image, and it is rasterised again only when the view
   * leaves the margin or a gesture ends at another zoom (rasterising the hairlines of the whole
   * sky costs far more than a frame on a phone without GPU canvas).
   */
  private readonly layer = document.createElement("canvas");
  private readonly layerCtx: CanvasRenderingContext2D;
  private layerKey = "";
  /** View the layer was rasterised for: zoom, offsets, margins (CSS px), resolution. */
  private cache = { zoom: 1, offX: 0, offY: 0, mx: 0, my: 0, res: 1 };
  private interacting = false;
  private skyVersion = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** The world at zoom 1 (CSS px): 2:1, at least as tall and as wide as the canvas. */
  private world: MapFrame = { width: 2, height: 1 };
  private zoom = 1;
  /** Screen position of the world's origin (CSS px): x wraps, y within the poles. */
  private offX = 0;
  private offY = 0;
  private theme: LatitudeTheme = { ink: "#f0e6d2", sky: "#101b52" };
  private lat = 48.85;
  private precession: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private sky: MapSky = { outlines: {}, segments: {}, stars: [] };
  /** Projected sky (world CSS px), rebuilt on size or date change. */
  private boundaryPath: Path2D | null = null;
  private figurePath: Path2D | null = null;
  private starRects: Float32Array = new Float32Array(0);
  private selected: string | null = null;
  private selectedRings: [number, number][][] = [];
  private selectedFigure: Path2D | null = null;
  private selectedAt: [number, number] | null = null;
  private labels: LatitudeMapLabels = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    const lctx = this.layer.getContext("2d");
    if (!ctx || !lctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.layerCtx = lctx;
  }

  /** The world frame at zoom 1 (CSS px). */
  get frame(): MapFrame {
    return this.world;
  }

  resize(width: number, height: number, dpr: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    // Keep the middle of the view on the same right ascension.
    const centre = this.width ? this.raAt(this.width / 2) : null;
    this.width = w;
    this.height = h;
    this.dpr = Math.min(3, Math.max(1, dpr));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const wh = Math.max(h, w / 2);
    this.world = { width: wh * 2, height: wh };
    this.project();
    if (centre !== null) this.centreOn(centre);
    else this.clampView();
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

  // --- View --------------------------------------------------------------------------------

  /** A drag or a pinch is on: the cached layer may be scaled until it ends. */
  setInteracting(on: boolean): void {
    this.interacting = on;
  }

  get view(): { zoom: number; x: number; y: number } {
    return { zoom: this.zoom, x: this.offX, y: this.offY };
  }
  /** Zoom 1, the world's top on the top edge, right ascension `ra` (degrees) in the middle. */
  resetView(ra?: number): void {
    this.zoom = 1;
    this.offY = 0;
    if (ra === undefined) this.offX = 0;
    else this.centreOn(ra);
    this.clampView();
  }
  /** Moves the view so that right ascension `ra` (degrees) is in the middle. */
  centreOn(ra: number): void {
    this.offX = this.width / 2 - mapX(this.world, ra) * this.zoom;
    this.clampView();
  }
  /** Moves the view so that the selected constellation is in the middle; false if none. */
  centreOnSelected(): boolean {
    if (!this.selectedAt) return false;
    const [x, y] = this.selectedAt;
    this.offX = this.width / 2 - x * this.zoom;
    this.offY = this.height / 2 - y * this.zoom;
    this.clampView();
    return true;
  }
  /** Right ascension of the selected constellation's middle (degrees), if any. */
  selectedRa(): number | null {
    if (!this.selectedAt) return null;
    return mapRaDec(this.world, this.selectedAt[0], this.selectedAt[1]).ra;
  }
  panBy(dx: number, dy: number): void {
    this.offX += dx;
    this.offY += dy;
    this.clampView();
  }
  /** Zooms by `factor` about the screen point (x, y), within [1, MAP_MAX_ZOOM]. */
  zoomAt(factor: number, x: number, y: number): void {
    const z = Math.max(1, Math.min(MAP_MAX_ZOOM, this.zoom * factor));
    const k = z / this.zoom;
    this.offX = x - (x - this.offX) * k;
    this.offY = y - (y - this.offY) * k;
    this.zoom = z;
    this.clampView();
  }
  private clampView(): void {
    const ww = this.world.width * this.zoom;
    this.offX = ((this.offX % ww) + ww) % ww;
    if (this.offX > 0) this.offX -= ww; // in (−ww, 0]
    const hh = this.world.height * this.zoom;
    this.offY = Math.min(0, Math.max(this.height - hh, this.offY));
  }
  /** Screen y (CSS px) of a declination. */
  screenY(dec: number): number {
    return mapY(this.world, dec) * this.zoom + this.offY;
  }
  private raAt(x: number): number {
    return mapRaDec(this.world, (x - this.offX) / this.zoom, 0).ra;
  }

  /** J2000 direction under a CSS pixel of the map. */
  pick(x: number, y: number): Vec3 {
    const { ra, dec } = mapRaDec(
      this.world,
      (x - this.offX) / this.zoom,
      (y - this.offY) / this.zoom,
    );
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
    const f = this.world;
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
    this.skyVersion++;
    this.projectSelected();
  }

  private projectSelected(): void {
    const f = this.world;
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

  /** Screen x offsets of the world copies that cover [lo, hi] (the sky wraps). */
  private copies(lo = 0, hi = this.width): number[] {
    const ww = this.world.width * this.zoom;
    const out: number[] = [];
    let x = this.offX;
    while (x > lo) x -= ww;
    for (; x < hi; x += ww) if (x + ww > lo) out.push(x);
    return out;
  }

  /** Draws a frame; returns its cost in ms. */
  draw(): number {
    if (!this.width || !this.height) return 0; // not laid out yet
    const t0 = performance.now();
    const { ctx, dpr } = this;
    const ink = this.theme.ink;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWashes();
    this.blitLayer();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.selectedRings.length) {
      const z = this.zoom;
      const ww = this.world.width;
      for (const x0 of this.copies()) {
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * x0, dpr * this.offY);
        const ring = new Path2D();
        for (const shift of [-ww, 0, ww])
          for (const r of this.selectedRings) {
            r.forEach(([x, y], i) => (i ? ring.lineTo(x + shift, y) : ring.moveTo(x + shift, y)));
            ring.closePath();
          }
        // A faint ink wash over the zones, the outline and the figure over the sky.
        ctx.globalAlpha = 0.1;
        ctx.fill(ring, "evenodd");
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.4 / z;
        ctx.stroke(ring);
        ctx.lineWidth = 1.1 / z;
        if (this.selectedFigure) ctx.stroke(this.selectedFigure);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.drawLimits();
    this.drawLabels();
    return performance.now() - t0;
  }

  /** The two caps as translucent bands across the canvas. */
  private drawWashes(): void {
    const { ctx, width: W, height: H } = this;
    if (Math.abs(this.lat) < 1e-9) return;
    const limit = 90 - Math.abs(this.lat);
    const top = Math.max(0, this.screenY(limit));
    const bottom = Math.min(H, this.screenY(-limit));
    const north = this.lat > 0;
    const always = this.theme.always ?? DEFAULT_WASHES.always;
    const never = this.theme.never ?? DEFAULT_WASHES.never;
    ctx.fillStyle = washColor(north ? always : never);
    if (top > 0) ctx.fillRect(0, 0, W, top);
    ctx.fillStyle = washColor(north ? never : always);
    if (bottom < H) ctx.fillRect(0, bottom, W, H - bottom);
  }

  /** Where the cached layer lands for the current view, or null if it does not cover it. */
  private placement(): { x: number; y: number; w: number; h: number } | null {
    const c = this.cache;
    const k = this.zoom / c.zoom;
    const w = (this.layer.width / c.res) * k;
    const h = (this.layer.height / c.res) * k;
    let x = (-c.mx - c.offX) * k + this.offX;
    const y = (-c.my - c.offY) * k + this.offY;
    // The same sky a whole turn away: the shift that centres the layer best on the view.
    const ww = this.world.width * this.zoom;
    x += Math.round((this.width / 2 - (x + w / 2)) / ww) * ww;
    const e = 0.5;
    if (x > e || y > e || x + w < this.width - e || y + h < this.height - e) return null;
    return { x, y, w, h };
  }

  private blitLayer(): void {
    const { ctx, dpr } = this;
    const key = `${this.width}x${this.height}@${dpr}|${this.theme.ink}|${this.skyVersion}`;
    let at = key === this.layerKey ? this.placement() : null;
    if (!at || (!this.interacting && this.zoom !== this.cache.zoom)) {
      this.layerKey = key;
      this.renderLayer();
      at = this.placement() ?? { x: 0, y: 0, w: this.width, h: this.height };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.layer, at.x * dpr, at.y * dpr, at.w * dpr, at.h * dpr);
  }

  /** Rasterises the boundaries, figures and stars of the view and a margin around it. */
  private renderLayer(): void {
    const { zoom: z, width: W, height: H } = this;
    // A margin only when the map can move: half a view across, a quarter up and down.
    const pannable = this.world.width * z > W + 0.5 || this.world.height * z > H + 0.5;
    const mx = pannable ? Math.round(W / 2) : 0;
    const my = pannable ? Math.round(H / 4) : 0;
    const cw = W + 2 * mx;
    const ch = H + 2 * my;
    // Full resolution, unless that would take more than 4 million pixels.
    const res = Math.min(this.dpr, Math.sqrt(4e6 / (cw * ch)));
    this.cache = { zoom: z, offX: this.offX, offY: this.offY, mx, my, res };
    const width = Math.max(1, Math.round(cw * res));
    const height = Math.max(1, Math.round(ch * res));
    const ctx = this.layerCtx;
    if (this.layer.width !== width || this.layer.height !== height) {
      this.layer.width = width;
      this.layer.height = height;
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
    }
    ctx.strokeStyle = this.theme.ink;
    ctx.fillStyle = this.theme.ink;
    ctx.lineCap = "round";
    const copies = this.copies(-mx, W + mx);
    const top = this.offY + my;
    for (const x0 of copies) {
      ctx.setTransform(res * z, 0, 0, res * z, res * (x0 + mx), res * top);
      // Hairlines stay a CSS hairline at any zoom.
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 0.6 / z;
      if (this.boundaryPath) ctx.stroke(this.boundaryPath);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.7 / z;
      if (this.figurePath) ctx.stroke(this.figurePath);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    // Stars grow a little with the zoom, in whole pixels of the layer.
    const grow = Math.min(2, Math.sqrt(z));
    const r = this.starRects;
    for (const x0 of copies)
      for (let i = 0; i < r.length; i += 3) {
        const sx = r[i]! * z + x0 + mx;
        const sy = r[i + 1]! * z + top;
        if (sx < -3 || sx > cw + 3 || sy < -3 || sy > ch + 3) continue;
        const size = Math.max(1, Math.round(r[i + 2]! * grow * res)) / res;
        const x = Math.round(sx * res) / res;
        const y = Math.round(sy * res) / res;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
  }

  private drawLimits(): void {
    const { ctx, width: W } = this;
    const limit = 90 - Math.abs(this.lat);
    // Celestial equator, dashed.
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, this.screenY(0));
    ctx.lineTo(W, this.screenY(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (Math.abs(this.lat) < 0.05) return;
    // The zones' edges: solid ink lines, so that the zones do not rest on colour alone.
    ctx.lineWidth = 1.1;
    for (const d of [limit, -limit]) {
      const y = Math.round(this.screenY(d) * this.dpr) / this.dpr;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  private drawLabels(): void {
    const { ctx, width: W, height: H } = this;
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
      ctx.lineJoin = "round";
      ctx.strokeStyle = this.theme.sky;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = this.theme.ink;
      ctx.fillText(s, x, y);
      ctx.globalAlpha = 1;
    };
    // The right edge: the zenith first, then the limits' values, then the ticks, each kept
    // clear of those already written (the zones' labels are on the left, in the page).
    const taken: number[] = [];
    const free = (y: number) => y > 6 && y < H - 6 && taken.every((t) => Math.abs(t - y) > 11);
    if (L.zenith) {
      const y = this.screenY(this.lat);
      if (y > -4 && y < H + 4) {
        ctx.beginPath();
        ctx.moveTo(W, y - 3.5);
        ctx.lineTo(W - 5, y);
        ctx.lineTo(W, y + 3.5);
        ctx.closePath();
        ctx.fillStyle = this.theme.ink;
        ctx.fill();
        text(L.zenith, W - 8, y, "right", "middle");
        taken.push(y);
      }
    }
    if (Math.abs(this.lat) >= 0.05) {
      // Values on each limit, on the side of its cap (or the other side to stay clear).
      const limit = 90 - Math.abs(this.lat);
      const north = this.lat > 0;
      for (const [value, dec, capAbove] of [
        [L.upperLimit, limit, north],
        [L.lowerLimit, -limit, !north],
      ] as const) {
        if (!value) continue;
        const y = this.screenY(dec);
        for (const above of [capAbove, !capAbove]) {
          const mid = y + (above ? -7 : 7);
          if (!free(mid)) continue;
          text(value, W - 3, y + (above ? -2 : 2), "right", above ? "bottom" : "top");
          taken.push(mid);
          break;
        }
      }
    }
    for (const t of L.decTicks ?? []) {
      const y = this.screenY(t.dec);
      if (!free(y)) continue;
      text(t.text, W - 3, y, "right", "middle", 0.7);
      taken.push(y);
    }
    const z = this.zoom;
    const copies = this.copies();
    for (const t of L.hourTicks ?? [])
      for (const x0 of copies) {
        const x = mapX(this.world, t.ra) * z + x0;
        if (x > 12 && x < W - 12) text(t.text, x, H - 3, "center", "bottom", 0.7);
      }
    if (L.selected && this.selectedAt) {
      ctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace";
      const [wx, wy] = this.selectedAt;
      const y = wy * z + this.offY;
      for (const x0 of copies) {
        const x = wx * z + x0;
        if (x < -40 || x > W + 40) continue;
        const clampedX = Math.min(W - 4, Math.max(4, x));
        const align: CanvasTextAlign = x < 50 ? "left" : x > W - 50 ? "right" : "center";
        text(
          L.selected.toUpperCase(),
          clampedX,
          Math.min(H - 10, Math.max(10, y)),
          align,
          "middle",
        );
        break;
      }
    }
  }
}
