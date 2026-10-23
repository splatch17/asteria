/**
 * The celestial sphere of the latitude explorer (#188), on a 2D canvas: a glass sphere seen from
 * outside, an observer standing at its centre on the opaque horizon disc, the celestial axis
 * pointing at the pole at an altitude equal to the latitude, and the sky turning about it.
 *
 * House style (ART_DIRECTION.md): two inks, 1-bit dither in whole CSS pixels.
 *  - Zones, per pixel of the sphere (front surface, then the back one seen through the glass
 *    unless the horizon disc hides it): the cap that never sets in fine dots (25 % in front, 6 %
 *    behind), the cap that never rises in diagonal hatching (25 %, 12 %), the band that rises and
 *    sets left clear; the horizon disc is a Bayer-dithered ground. The caps are symmetric about
 *    the axis, so the dithered image only changes with the latitude, the size or the ink: it is
 *    cached, and a frame of the turning sky only redraws vectors.
 *  - Vectors at device resolution: horizon, celestial equator, the two limit parallels
 *    (solid in front, dashed behind, hidden behind the ground), the axis, the altitude of the
 *    pole, the cardinal points, bright stars as whole-pixel dots (dimmed under the horizon) and
 *    the selected constellation's outline and figure.
 * Cost: ≈ 40 000 pixels when the latitude changes, a few hundred projected points otherwise.
 */
import { applyMat3, multiplyMat3, type Mat3, type Vec3 } from "@asteria/astro-core";
import {
  celestialPole,
  equatorToHorizon,
  hiddenByGround,
  parallelCircle,
  projectSphere,
  sphereCamera,
  visibilityOf,
  type SphereCamera,
} from "./latitude-geometry";

const RAD = Math.PI / 180;

export interface LatitudeTheme {
  ink: string;
  sky: string;
}

/** Texts drawn on the picture (already translated); a missing one is not drawn. */
export interface LatitudeSphereLabels {
  north: string;
  south: string;
  east: string;
  west: string;
  /** Next to the visible celestial pole. */
  pole?: string;
  /** Along the celestial equator. */
  equator?: string;
  /** The pole's altitude (the latitude), at its arc. */
  angle?: string;
  /** Written on the cap that never sets and on the one that never rises. */
  always?: string;
  never?: string;
}

/** A star of the turning sky: J2000 unit vector and V magnitude. */
export interface SphereStar {
  dir: Vec3;
  v: number;
}

/** The selected constellation: outline rings and figure segments, J2000 unit vectors. */
export interface SphereHighlight {
  outline: Vec3[][];
  segments: [Vec3, Vec3][];
}

/** Colour string → [r, g, b] (#rgb, #rrggbb). */
function rgb(color: string): [number, number, number] {
  let hex = color.trim().replace(/^#/, "");
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const n = Number.parseInt(hex.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [240, 230, 210];
}

/**
 * Ink pattern of a zone at a whole CSS pixel: dots for « always », diagonal hatching for
 * « never », nothing for the band that rises and sets. Three strengths: 0 the sphere's front
 * (25 %), 1 the flat map (11 % dots, 17 % hatching: its figures must read through), 2 the
 * sphere's back seen through the glass (6 %, 12 %).
 */
export function zoneInk(zone: 0 | 1 | 2, x: number, y: number, strength: 0 | 1 | 2 = 0): boolean {
  if (zone === 1) {
    const k = strength === 0 ? 2 : strength === 1 ? 3 : 4;
    return x % k === 0 && y % k === 0;
  }
  if (zone === 2) return (x + y) % (strength === 0 ? 4 : strength === 1 ? 6 : 8) === 0;
  return false;
}

/** Zone of a direction from its sin(declination): 0 rises and sets, 1 always up, 2 never up. */
function zoneOfSin(sinDec: number, pole: number, sinLimit: number): 0 | 1 | 2 {
  if (pole === 0) return 0;
  const s = sinDec * pole;
  return s > sinLimit ? 1 : s < -sinLimit ? 2 : 0;
}

export class LatitudeSphere {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly buffer = document.createElement("canvas");
  private readonly bufferCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private theme: LatitudeTheme = { ink: "#f0e6d2", sky: "#101b52" };
  private lat = 48.85;
  private lst = 0;
  private precession: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private stars: { dir: Vec3; v: number }[] = [];
  private highlight: SphereHighlight | null = null;
  private labels: LatitudeSphereLabels = { north: "N", south: "S", east: "E", west: "W" };
  private readonly cam: SphereCamera;
  /** Key of the cached dither (latitude, size, ink): redrawn when it changes. */
  private shadedKey = "";

  constructor(canvas: HTMLCanvasElement, camera: SphereCamera = sphereCamera(228, 20)) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    const bctx = this.buffer.getContext("2d");
    if (!ctx || !bctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bufferCtx = bctx;
    this.cam = camera;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.dpr = Math.min(3, Math.max(1, dpr));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }
  setTheme(theme: LatitudeTheme): void {
    this.theme = theme;
  }
  setLatitude(lat: number): void {
    this.lat = Math.max(-90, Math.min(90, lat));
  }
  /** Local sidereal time (degrees): the sky turns as it grows. */
  setSiderealTime(lst: number): void {
    this.lst = lst;
  }
  /** J2000 → equator of date (the explorer's date). */
  setPrecession(m: Mat3): void {
    this.precession = m;
  }
  setStars(stars: readonly SphereStar[]): void {
    this.stars = stars.map((s) => ({ dir: s.dir, v: s.v }));
  }
  setHighlight(h: SphereHighlight | null): void {
    this.highlight = h;
  }
  setLabels(labels: LatitudeSphereLabels): void {
    this.labels = labels;
  }

  /** Sphere radius and centre (CSS px): room left for the axis and the labels. */
  layout(): { cx: number; cy: number; radius: number } {
    const radius = Math.max(10, Math.min(this.width * 0.36, this.height * 0.4));
    return { cx: this.width / 2, cy: this.height / 2 + radius * 0.04, radius };
  }

  /** J2000 direction on the front of the sphere under a CSS pixel, or null (outside, ground). */
  pick(x: number, y: number): Vec3 | null {
    const { cx, cy, radius } = this.layout();
    const sx = (x - cx) / radius;
    const sy = (cy - y) / radius;
    const r2 = sx * sx + sy * sy;
    if (r2 > 1) return null;
    const w = Math.sqrt(1 - r2);
    const { r, s, c } = this.cam;
    const p: Vec3 = [
      sx * r[0] + sy * s[0] + w * c[0],
      sx * r[1] + sy * s[1] + w * c[1],
      sx * r[2] + sy * s[2] + w * c[2],
    ];
    // Horizon → J2000: the inverse (transpose) of J2000 → equator of date → horizon.
    const m = multiplyMat3(equatorToHorizon(this.lat, this.lst), this.precession);
    return [
      m[0] * p[0] + m[3] * p[1] + m[6] * p[2],
      m[1] * p[0] + m[4] * p[1] + m[7] * p[2],
      m[2] * p[0] + m[5] * p[1] + m[8] * p[2],
    ];
  }

  /** Draws a frame; returns its cost in ms. */
  draw(): number {
    if (!this.width || !this.height) return 0; // not laid out yet
    const t0 = performance.now();
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme.sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const { cx, cy, radius } = this.layout();
    this.shade(cx, cy, radius);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.buffer,
      Math.round((cx - radius - 1) * dpr),
      Math.round((cy - radius - 1) * dpr),
      this.buffer.width * dpr,
      this.buffer.height * dpr,
    );
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawVectors(cx, cy, radius);
    return performance.now() - t0;
  }

  /** The dithered zones and ground, at one dot per CSS pixel, cached. */
  private shade(cx: number, cy: number, radius: number): void {
    const size = Math.ceil(radius * 2) + 2;
    const key = `${this.lat.toFixed(3)}|${size}|${this.theme.ink}`;
    if (key === this.shadedKey) return;
    this.shadedKey = key;
    this.buffer.width = size;
    this.buffer.height = size;
    const image = this.bufferCtx.createImageData(size, size);
    const px = new Uint32Array(image.data.buffer);
    const [ir, ig, ib] = rgb(this.theme.ink);
    const ink = ((255 << 24) | (ib << 16) | (ig << 8) | ir) >>> 0;
    const { r, s, c } = this.cam;
    const pole = celestialPole(this.lat);
    const [rp, sp, cpole] = [
      r[0] * pole[0] + r[1] * pole[1] + r[2] * pole[2],
      s[0] * pole[0] + s[1] * pole[1] + s[2] * pole[2],
      c[0] * pole[0] + c[1] * pole[1] + c[2] * pole[2],
    ];
    const visiblePole = this.lat > 1e-9 ? 1 : this.lat < -1e-9 ? -1 : 0;
    const sinLimit = Math.sin((90 - Math.abs(this.lat)) * RAD);
    // Screen position of the buffer's origin in sphere units; whole CSS pixels for the patterns.
    const ox = cx - radius - 1;
    const oy = cy - radius - 1;
    const gx = Math.round(ox);
    const gy = Math.round(oy);
    for (let j = 0; j < size; j++) {
      const sy = (cy - (oy + j + 0.5)) / radius;
      for (let i = 0; i < size; i++) {
        const sx = (ox + i + 0.5 - cx) / radius;
        const r2 = sx * sx + sy * sy;
        if (r2 > 1) continue;
        const w = Math.sqrt(1 - r2);
        const base = sx * rp + sy * sp;
        const X = gx + i;
        const Y = gy + j;
        let on = zoneInk(zoneOfSin(base + w * cpole, visiblePole, sinLimit), X, Y, 0);
        if (!on) {
          // The horizon plane u = 0 along the ray (t from the front, w, to the back, −w).
          const t = c[2] !== 0 ? -(sx * r[2] + sy * s[2]) / c[2] : Infinity;
          // Behind the horizon disc: its engraving is drawn as vectors (drawVectors).
          if (Math.abs(t) <= w) on = false;
          else on = zoneInk(zoneOfSin(base - w * cpole, visiblePole, sinLimit), X, Y, 2);
        }
        if (on) px[j * size + i] = ink;
      }
    }
    this.bufferCtx.putImageData(image, 0, 0);
  }

  private drawVectors(cx: number, cy: number, radius: number): void {
    const { ctx, cam } = this;
    const ink = this.theme.ink;
    const at = (p: Vec3): [number, number] => {
      const q = projectSphere(cam, p);
      return [cx + q.x * radius, cy - q.y * radius];
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;

    // Silhouette of the glass sphere.
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const pole = celestialPole(this.lat);
    const limit = 90 - Math.abs(this.lat);
    const meridianStart: Vec3 = [0, 1, 0];
    // Celestial equator, then the two limit parallels (they touch the horizon at N and S).
    this.circle(parallelCircle(pole, 0, 128, [1, 0, 0]), at, 0.9, 0.55);
    if (Math.abs(this.lat) > 0.05) {
      this.circle(parallelCircle(pole, limit, 128, meridianStart), at, 1.1, 0.95);
      this.circle(parallelCircle(pole, -limit, 128, meridianStart), at, 1.1, 0.95);
    }
    // Horizon: the ground disc, engraved with fine horizontal lines (one device pixel, every
    // 2.5 CSS px), and its rim, always seen.
    const rim = new Path2D();
    for (let i = 0; i <= 128; i++) {
      const a = (2 * Math.PI * i) / 128;
      const [x, y] = at([Math.cos(a), Math.sin(a), 0]);
      if (i) rim.lineTo(x, y);
      else rim.moveTo(x, y);
    }
    ctx.save();
    ctx.clip(rim);
    ctx.lineWidth = 1 / this.dpr;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const [, midY] = at([0, 0, 0]);
    for (let y = Math.floor((midY - radius) / 2.5) * 2.5; y < midY + radius; y += 2.5) {
      const yy = (Math.round(y * this.dpr) + 0.5) / this.dpr;
      ctx.moveTo(cx - radius, yy);
      ctx.lineTo(cx + radius, yy);
    }
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.25;
    ctx.stroke(rim);

    // The turning sky: stars, then the selected constellation.
    const m = multiplyMat3(equatorToHorizon(this.lat, this.lst), this.precession);
    for (const star of this.stars) {
      const p = applyMat3(m, star.dir);
      const vis = visibilityOf(cam, p);
      // Behind the glass, only the brightest: the caps' dither must stay readable.
      if (vis === "hidden" || (vis === "back" ? star.v > 2.5 : star.v > 4)) continue;
      const [x, y] = at(p);
      const up = p[2] >= 0;
      ctx.globalAlpha = vis === "front" ? (up ? 1 : 0.4) : up ? 0.4 : 0.22;
      const size = vis === "front" ? (star.v < 1 ? 2 : star.v < 2.5 ? 1.5 : 1) : 1;
      const px = 1 / this.dpr;
      const sx = Math.round(x * this.dpr) / this.dpr;
      const sy = Math.round(y * this.dpr) / this.dpr;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      if (vis === "front" && up && star.v < 1) {
        // A bright star: a whole-pixel cross, as the vignettes draw them.
        ctx.fillRect(sx - 2.5, sy - px / 2, 5, px * 1.5);
        ctx.fillRect(sx - px / 2, sy - 2.5, px * 1.5, 5);
      }
    }
    ctx.globalAlpha = 1;
    if (this.highlight) {
      for (const ring of this.highlight.outline)
        this.polyline(
          ring.map((v) => applyMat3(m, v)),
          at,
          { width: 1.4, alpha: 1 },
          { width: 0.9, alpha: 0.5, dash: [2, 2.5] },
        );
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const [a, b] of this.highlight.segments) {
        const pa = applyMat3(m, a);
        const pb = applyMat3(m, b);
        if (visibilityOf(cam, pa) !== "front" || visibilityOf(cam, pb) !== "front") continue;
        ctx.moveTo(...at(pa));
        ctx.lineTo(...at(pb));
      }
      ctx.stroke();
    }

    // The celestial axis, through the observer, and the visible pole.
    const tip = 1.22;
    const pts: Vec3[] = [];
    for (let i = 0; i <= 60; i++) {
      const k = -tip + (2 * tip * i) / 60;
      pts.push([pole[0] * k, pole[1] * k, pole[2] * k]);
    }
    this.polyline(
      pts,
      at,
      { width: 1, alpha: 0.95 },
      { width: 0.8, alpha: 0.35, dash: [1.5, 2.5] },
      true,
    );

    const up = this.lat >= 0 ? 1 : -1;
    const top: Vec3 = [pole[0] * up * 1.13, pole[1] * up * 1.13, pole[2] * up * 1.13];
    const [tx, ty] = at(top);
    this.sparkle(tx, ty, 4.2);

    // The pole's altitude above the horizon equals the latitude.
    const h = Math.abs(this.lat);
    if (h > 2) {
      const side = this.lat >= 0 ? 1 : -1;
      const arc: Vec3[] = [];
      const rr = 0.3;
      for (let i = 0; i <= 32; i++) {
        const a = ((h * i) / 32) * RAD;
        arc.push([0, side * Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      arc.forEach((p, i) => (i ? ctx.lineTo(...at(p)) : ctx.moveTo(...at(p))));
      ctx.stroke();
    }

    // The observer, standing at the centre.
    const [ox, oy] = at([0, 0, 0]);
    ctx.fillStyle = this.theme.sky;
    ctx.fillRect(ox - 2.5, oy - 9, 5, 10);
    ctx.fillStyle = ink;
    ctx.fillRect(ox - 0.75, oy - 6, 1.5, 6);
    ctx.fillRect(ox - 1.5, oy - 8.8, 3, 3);

    this.drawLabels(at, top, cx);
  }

  /** A circle of the sphere: solid in front, dashed behind, nothing behind the ground. */
  private circle(points: Vec3[], at: (p: Vec3) => [number, number], width: number, alpha: number) {
    this.polyline(
      points,
      at,
      { width, alpha },
      { width: width * 0.8, alpha: alpha * 0.5, dash: [2, 3] },
    );
  }

  private polyline(
    points: Vec3[],
    at: (p: Vec3) => [number, number],
    front: { width: number; alpha: number },
    back: { width: number; alpha: number; dash: number[] },
    /** Points inside the sphere (the axis): front unless behind the ground. */
    interior = false,
  ): void {
    const { ctx, cam } = this;
    const kind = (p: Vec3) => {
      if (hiddenByGround(cam, p)) return interior ? 1 : 2;
      if (interior) return 0;
      return visibilityOf(cam, p) === "front" ? 0 : 1;
    };
    let run: [number, number][] = [];
    let current = -1;
    const flush = () => {
      if (run.length > 1 && current !== 2) {
        const st = current === 0 ? front : back;
        ctx.globalAlpha = st.alpha;
        ctx.lineWidth = st.width;
        ctx.setLineDash(current === 0 ? [] : back.dash);
        ctx.beginPath();
        run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      run = [];
    };
    for (const p of points) {
      const k = kind(p);
      const xy = at(p);
      if (k !== current) {
        // Keep the runs joined: the boundary point belongs to both.
        const last = run[run.length - 1];
        flush();
        if (last) run.push(last);
        current = k;
      }
      run.push(xy);
    }
    flush();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /** Four-pointed sparkle, the house mark of a bright star (the pole). */
  private sparkle(x: number, y: number, r: number): void {
    const { ctx } = this;
    const k = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + k, y - k);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + k, y + k);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - k, y + k);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - k, y - k);
    ctx.closePath();
    ctx.fill();
  }

  private drawLabels(at: (p: Vec3) => [number, number], top: Vec3, cx: number): void {
    const { ctx, cam } = this;
    const L = this.labels;
    ctx.font = "500 9px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0.9px";
    const text = (s: string, x: number, y: number, align: CanvasTextAlign, alpha = 1) => {
      ctx.globalAlpha = alpha;
      // Kept inside the canvas: as left-aligned text from its clamped left edge.
      const w = ctx.measureText(s).width;
      const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
      x = Math.min(this.width - 2 - w, Math.max(2, left));
      ctx.textAlign = "left";
      // A clear halo of the sky so that the text reads over the dither.
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.theme.sky;
      ctx.strokeText(s, x, y);
      ctx.fillText(s, x, y);
      ctx.globalAlpha = 1;
    };
    ctx.fillStyle = this.theme.ink;
    const cardinal: [string, Vec3][] = [
      [L.north, [0, 1.1, 0]],
      [L.south, [0, -1.1, 0]],
      [L.east, [1.1, 0, 0]],
      [L.west, [-1.1, 0, 0]],
    ];
    for (const [s, p] of cardinal) {
      const [x, y] = at(p);
      const front = projectSphere(cam, p).z >= 0;
      text(s, x, y + (front ? 2 : -1), "center", front ? 1 : 0.55);
    }
    if (L.pole) {
      const [x, y] = at(top);
      const right = x >= cx;
      // Near the horizon (low latitudes) the side would hit the cardinal letter: above it.
      if (Math.abs(this.lat) < 15) text(L.pole, x, y - 11, "center", 0.9);
      else text(L.pole, x + (right ? -9 : 9), y, right ? "right" : "left", 0.9);
    }
    if (L.angle && Math.abs(this.lat) > 2) {
      const side = this.lat >= 0 ? 1 : -1;
      const a = (Math.abs(this.lat) / 2) * RAD;
      const [x, y] = at([0, side * Math.cos(a) * 0.46, Math.sin(a) * 0.46]);
      text(L.angle, x, y, "center");
    }
    // Each cap named inside it, on its front, a third of the way from the limit to the pole, as
    // far as possible from the pole's mark and label on the screen.
    const limit = 90 - Math.abs(this.lat);
    if (limit < 78) {
      const pole = celestialPole(this.lat);
      const sign = this.lat >= 0 ? 1 : -1;
      const tips = [at(top), at([-top[0], -top[1], -top[2]])];
      const dec = limit + (90 - limit) / 3;
      [L.always, L.never].forEach((label, k) => {
        if (!label) return;
        const [tx, ty] = tips[k]!;
        let best: [number, number] | null = null;
        let score = -Infinity;
        for (const p of parallelCircle(pole, (k ? -sign : sign) * dec, 48)) {
          const z = projectSphere(cam, p).z;
          if (z < 0.1 || hiddenByGround(cam, p)) continue;
          const [x, y] = at(p);
          const d = Math.hypot(x - tx, y - ty);
          if (d > score) [score, best] = [d, [x, y]];
        }
        if (best) text(label, best[0], best[1], "center", 1);
      });
    }
    if (L.equator) {
      // Where the equator meets the sphere's outline lowest on the screen, written outside it,
      // clear of the latitude written at the top left.
      let best: [number, number] | null = null;
      for (const p of parallelCircle(celestialPole(this.lat), 0, 180)) {
        if (Math.abs(projectSphere(cam, p).z) > 0.06) continue;
        const xy = at(p);
        if (!best || xy[1] > best[1]) best = xy;
      }
      if (best) {
        const right = best[0] >= cx;
        text(L.equator, best[0] + (right ? 6 : -6), best[1] + 8, right ? "left" : "right", 0.8);
      }
    }
  }
}
