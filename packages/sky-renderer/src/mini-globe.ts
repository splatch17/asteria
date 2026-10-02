/**
 * Mini-globe of the sky view (#38): a small Earth centred on the observer, north up, with the
 * day/night terminator of the displayed date. Drawn on a 2D canvas, on demand only (a date or
 * style change schedules one frame), at a small resolution:
 *  - engraving: the Earth view's engraved globe formula (relief by day, city lights by night,
 *    twilight band), dithered 1-bit with the same Bayer 8×8 matrix, in whole device pixels
 *    (one or two per cell: finer than the Earth view's 1 CSS px, for a 56 px globe);
 *  - realistic: continuous shading (relief-based colours, as the Earth view before its colour
 *    texture arrives, or that texture when given), in shades of the ink in red night vision.
 *
 * The observer is fixed while the date runs, so the geometry of every pixel (Earth-fixed normal,
 * relief and lights samples) is computed once per observer/size; a frame only takes one dot
 * product per pixel with the Sun's direction (≈ 3 000 pixels engraved, 12 000 realistic).
 */
import { greenwichMeanSiderealTime, precessionMatrix, type Vec3 } from "@asteria/astro-core";
import type { SpaceStyle } from "./space-style";

const DEG = Math.PI / 180;

export interface MiniGlobeImages {
  /** Equirectangular relief luminance (the Earth view's relief.webp). */
  relief: CanvasImageSource;
  /** Equirectangular night lights (lights.webp). */
  lights: CanvasImageSource;
  /** Optional colour day texture (earth-day.webp), for the realistic style. */
  day?: CanvasImageSource | null;
}

export interface MiniGlobeTheme {
  ink: string;
  /** Unlit ground colour (the theme's `ground`), as on the Earth view's engraved globe. */
  base: string;
}

export interface MiniGlobeOptions {
  canvas: HTMLCanvasElement;
  /** Diameter in CSS px. */
  size: number;
  theme: MiniGlobeTheme;
  style?: SpaceStyle;
  monochrome?: boolean;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bayer threshold in [0, 1) at integer cell (x, y): the shaders' bayer8 (shaders.ts `dither`). */
export function bayer8(x: number, y: number): number {
  const b2 = (ax: number, ay: number) => {
    const fx = Math.floor(ax);
    const fy = Math.floor(ay);
    const v = fx / 2 + fy * fy * 0.75;
    return v - Math.floor(v);
  };
  const b4 = (ax: number, ay: number) => b2(0.5 * ax, 0.5 * ay) * 0.25 + b2(ax, ay);
  return b4(0.5 * x, 0.5 * y) * 0.25 + b2(x, y);
}

/** Engraved ink density of a globe point (SpaceView's globeFrag, uDetail = 0). */
export function engravedInk(relief: number, lights: number, mu: number): number {
  const day = smooth(-0.06, 0.1, mu);
  const ink = lights * 0.95 + (relief * 0.85 + 0.05 - lights * 0.95) * day;
  return Math.max(ink, (1 - Math.abs(mu) * 12) * 0.12);
}

/** City lights density from a sharp and a blurred sample (as globeFrag). */
export const lightsDensity = (sharp: number, halo: number): number =>
  Math.max(smooth(0.3, 0.7, sharp), smooth(0.26, 0.5, halo) * 0.7);

/**
 * Lights on the mini-globe, whose pixels span ~2°: a city covers a fraction of one, so the
 * blurred sample (~1.4° texels) also counts with a lower threshold, or Europe would stay dark.
 */
const globeLights = (sharp: number, halo: number): number =>
  Math.max(lightsDensity(sharp, halo), smooth(0.18, 0.38, halo) * 0.8);

/**
 * Earth-fixed unit normal seen at (x, y) ∈ [−1, 1]² (y up) on an orthographic globe centred on
 * (latitude, longitude), north up. False outside the disc.
 */
export function orthographicNormal(
  x: number,
  y: number,
  latitudeDeg: number,
  longitudeDeg: number,
  out: Vec3,
): boolean {
  const r2 = x * x + y * y;
  if (r2 > 1) return false;
  const z = Math.sqrt(1 - r2);
  const [lat, lon] = [latitudeDeg * DEG, longitudeDeg * DEG];
  const [cl, sl, co, so] = [Math.cos(lat), Math.sin(lat), Math.cos(lon), Math.sin(lon)];
  // Local basis at the centre: up, east, north (Earth-fixed).
  out[0] = z * cl * co - x * so - y * sl * co;
  out[1] = z * cl * so + x * co - y * sl * so;
  out[2] = z * sl + y * cl;
  return true;
}

/**
 * Direction of the Sun in the Earth-fixed frame (x towards Greenwich on the equator, z north),
 * from its J2000 direction: precession to the equator of date, then the Earth's rotation by the
 * Greenwich mean sidereal time (as the Earth view's globe, SpaceView.refresh).
 */
export function sunEarthFixed(sunJ2000: Vec3, date: Date, out: Vec3 = [0, 0, 0]): Vec3 {
  const p = precessionMatrix(date);
  const [x, y, z] = sunJ2000;
  const ex = p[0] * x + p[1] * y + p[2] * z;
  const ey = p[3] * x + p[4] * y + p[5] * z;
  const ez = p[6] * x + p[7] * y + p[8] * z;
  const g = greenwichMeanSiderealTime(date) * DEG;
  const [c, s] = [Math.cos(g), Math.sin(g)];
  out[0] = c * ex + s * ey;
  out[1] = -s * ex + c * ey;
  out[2] = ez;
  return out;
}

/** Colour string → [r, g, b] in 0…255 (#rgb, #rrggbb). */
function rgb(color: string): [number, number, number] {
  let hex = color.trim().replace(/^#/, "");
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const n = Number.parseInt(hex.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
}

/** RGBA packed for a little-endian Uint32Array view of ImageData. */
const pack = (r: number, g: number, b: number, a = 255) =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

/** Equirectangular luminance samples (0…1) of an image, w × h. */
interface Lum {
  w: number;
  h: number;
  data: Float32Array;
}

/** RGB samples (linear 0…1) of an image, w × h. */
interface Rgb {
  w: number;
  h: number;
  data: Float32Array;
}

function sampleImage(image: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function luminance(image: CanvasImageSource, w: number, h: number): Lum | null {
  const px = sampleImage(image, w, h);
  if (!px) return null;
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = px[i * 4]! / 255; // grayscale: red = luminance
  return { w, h, data };
}

function colours(image: CanvasImageSource, w: number, h: number): Rgb | null {
  const px = sampleImage(image, w, h);
  if (!px) return null;
  const data = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) data[i] = (px[Math.floor(i / 3) * 4 + (i % 3)]! / 255) ** 2.2;
  return { w, h, data };
}

/** Index of the texel under an Earth-fixed normal (lon −180 at x = 0, north at y = 0). */
function texel(n: Vec3, w: number, h: number): number {
  const u = Math.atan2(n[1], n[0]) / (2 * Math.PI) + 0.5;
  const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, n[2]))) / Math.PI;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  return y * w + x;
}

export class MiniGlobe {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Globe drawn at its own resolution, then scaled onto the canvas. */
  private readonly buffer = document.createElement("canvas");
  private readonly bufferCtx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private pixels: Uint32Array | null = null;
  private size: number;
  private theme: MiniGlobeTheme;
  private style: SpaceStyle;
  private monochrome: boolean;
  private observer = { latitude: 0, longitude: 0 };
  private readonly sun: Vec3 = [1, 0, 0];
  /** Sun direction of the last drawn frame (a change below ~0.03° does not redraw). */
  private readonly drawnSun: Vec3 = [NaN, NaN, NaN];
  private relief: Lum | null = null;
  private lights: Lum | null = null;
  private lightsHalo: Lum | null = null;
  private day: Rgb | null = null;
  /** Per pixel of the buffer, inside the disc: normal (3), relief, lights, albedo (3). */
  private geometry: {
    n: number;
    index: Int32Array;
    normals: Float32Array;
    relief: Float32Array;
    lights: Float32Array;
    albedo: Float32Array;
    bayer: Float32Array;
  } | null = null;
  private geometryStale = true;
  private dirty = true;
  private raf = 0;

  constructor(options: MiniGlobeOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d")!;
    this.bufferCtx = this.buffer.getContext("2d")!;
    this.size = options.size;
    this.theme = options.theme;
    this.style = options.style ?? "engraving";
    this.monochrome = options.monochrome ?? false;
    this.schedule();
  }

  /** Relief and lights (and optionally the colour day texture), sampled once at low resolution. */
  setImages(images: MiniGlobeImages): void {
    this.relief = luminance(images.relief, 512, 256);
    this.lights = luminance(images.lights, 1024, 512);
    this.lightsHalo = luminance(images.lights, 256, 128);
    this.day = images.day ? colours(images.day, 512, 256) : null;
    this.geometryStale = true;
    this.schedule();
  }

  /** Colour day texture of the realistic style, once the Earth view has loaded it. */
  setDayTexture(day: CanvasImageSource | null): void {
    this.day = day ? colours(day, 512, 256) : null;
    this.geometryStale = true;
    this.schedule();
  }

  setObserver(latitude: number, longitude: number): void {
    if (latitude === this.observer.latitude && longitude === this.observer.longitude) return;
    this.observer = { latitude, longitude };
    this.geometryStale = true;
    this.schedule();
  }

  /** Sun direction in the Earth-fixed frame (see sunEarthFixed). */
  setSun(direction: Readonly<Vec3>): void {
    const [x, y, z] = direction;
    const d = this.drawnSun;
    this.sun[0] = x;
    this.sun[1] = y;
    this.sun[2] = z;
    // ~0.03°: the terminator does not move by a pixel.
    if (!(Math.abs(x - d[0]) + Math.abs(y - d[1]) + Math.abs(z - d[2]) < 5e-4)) this.schedule();
  }

  setStyle(style: SpaceStyle): void {
    if (style === this.style) return;
    this.style = style;
    this.geometryStale = true;
    this.schedule();
  }

  setTheme(theme: MiniGlobeTheme, monochrome = this.monochrome): void {
    this.theme = theme;
    this.monochrome = monochrome;
    this.schedule();
  }

  /** Diameter in CSS px (the canvas is sized by draw()). */
  setSize(size: number): void {
    if (size === this.size) return;
    this.size = size;
    this.geometryStale = true;
    this.schedule();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Draws on the next animation frame (several changes in a frame draw once). */
  private schedule(): void {
    this.dirty = true;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.dirty) this.draw();
    });
  }

  /**
   * Buffer resolution: engraved, a dither cell of whole device pixels (1, or 2 from dpr 2.25: a
   * 56 px globe at dpr 3 has 84 cells across); realistic, up to 2 device px per CSS px.
   */
  private resolution(): number {
    const dpr = globalThis.devicePixelRatio || 1;
    const n =
      this.style === "realistic"
        ? this.size * Math.min(2, dpr)
        : (this.size * dpr) / Math.max(1, Math.round(dpr / 1.5));
    return Math.max(8, Math.round(n));
  }

  private buildGeometry(): void {
    this.geometryStale = false;
    const n = this.resolution();
    this.buffer.width = this.buffer.height = n;
    this.image = this.bufferCtx.createImageData(n, n);
    this.pixels = new Uint32Array(this.image.data.buffer);
    const count = n * n;
    const index = new Int32Array(count);
    const normals = new Float32Array(count * 3);
    const relief = new Float32Array(count);
    const lights = new Float32Array(count);
    const albedo = new Float32Array(count * 3);
    const bayer = new Float32Array(count);
    const v: Vec3 = [0, 0, 0];
    const { latitude, longitude } = this.observer;
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * 2 - 1;
        const y = 1 - ((j + 0.5) / n) * 2;
        if (!orthographicNormal(x, y, latitude, longitude, v)) continue;
        index[k] = j * n + i;
        normals.set(v, k * 3);
        const r = this.relief ? this.relief.data[texel(v, this.relief.w, this.relief.h)]! : 0.3;
        relief[k] = r;
        lights[k] =
          this.lights && this.lightsHalo
            ? globeLights(
                this.lights.data[texel(v, this.lights.w, this.lights.h)]!,
                this.lightsHalo.data[texel(v, this.lightsHalo.w, this.lightsHalo.h)]!,
              )
            : 0;
        if (this.day) {
          const t = texel(v, this.day.w, this.day.h) * 3;
          albedo[k * 3] = this.day.data[t]!;
          albedo[k * 3 + 1] = this.day.data[t + 1]!;
          albedo[k * 3 + 2] = this.day.data[t + 2]!;
        } else {
          // As the Earth view's realistic globe before its colour texture: from the relief.
          const land = smooth(0.35, 0.5, r);
          albedo[k * 3] = (0.02 + (0.32 - 0.02) * land) ** 2.2;
          albedo[k * 3 + 1] = (0.05 + (0.36 - 0.05) * land) ** 2.2;
          albedo[k * 3 + 2] = (0.13 + (0.2 - 0.13) * land) ** 2.2;
        }
        bayer[k] = bayer8(i, j);
        k++;
      }
    }
    this.geometry = {
      n: k,
      index,
      normals,
      relief,
      lights,
      albedo,
      bayer,
    };
  }

  private draw(): void {
    this.dirty = false;
    if (this.geometryStale) this.buildGeometry();
    const g = this.geometry!;
    const px = this.pixels!;
    const [sx, sy, sz] = this.sun;
    px.fill(0);
    const [ir, ig, ib] = rgb(this.theme.ink);
    if (this.style === "realistic") {
      for (let k = 0; k < g.n; k++) {
        const mu = g.normals[k * 3]! * sx + g.normals[k * 3 + 1]! * sy + g.normals[k * 3 + 2]! * sz;
        const lambert = Math.max(mu, 0) * 1.9;
        const twilight = 0.008 * Math.exp(-((mu / 0.05) ** 2)) * (mu > -0.1 ? 1 : 0);
        const night = g.lights[k]! * 0.55 * (1 - smooth(-0.1, 0.04, mu));
        const sky = 0.25 * smooth(-0.1, 0.4, mu);
        let r = g.albedo[k * 3]! * lambert + 0.012 * sky + 0.6 * twilight + night;
        let gg = g.albedo[k * 3 + 1]! * lambert + 0.03 * sky + 0.25 * twilight + night * 0.68;
        let b = g.albedo[k * 3 + 2]! * lambert + 0.08 * sky + 0.08 * twilight + night * 0.32;
        r = Math.min(1, r) ** (1 / 2.2);
        gg = Math.min(1, gg) ** (1 / 2.2);
        b = Math.min(1, b) ** (1 / 2.2);
        if (this.monochrome) {
          const l = Math.min(1, 0.2126 * r + 0.7152 * gg + 0.0722 * b);
          px[g.index[k]!] = pack(ir * l, ig * l, ib * l);
        } else px[g.index[k]!] = pack(r * 255, gg * 255, b * 255);
      }
    } else {
      const on = pack(ir, ig, ib);
      const [br, bg, bb] = rgb(this.theme.base);
      const off = pack(br, bg, bb);
      for (let k = 0; k < g.n; k++) {
        const mu = g.normals[k * 3]! * sx + g.normals[k * 3 + 1]! * sy + g.normals[k * 3 + 2]! * sz;
        const ink = engravedInk(g.relief[k]!, g.lights[k]!, mu);
        // +0.001: a zero density stays dark (as globeFrag).
        px[g.index[k]!] = g.bayer[k]! + 0.001 < ink ? on : off;
      }
    }
    this.bufferCtx.putImageData(this.image!, 0, 0);
    this.drawnSun[0] = sx;
    this.drawnSun[1] = sy;
    this.drawnSun[2] = sz;

    // Onto the visible canvas: crisp 1-bit cells (engraving) or smooth shading (realistic).
    const dpr = globalThis.devicePixelRatio || 1;
    const side = Math.round(this.size * dpr);
    if (this.canvas.width !== side || this.canvas.height !== side) {
      this.canvas.width = this.canvas.height = side;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, side, side);
    ctx.save();
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, side / 2 - dpr * 0.5, 0, 2 * Math.PI);
    ctx.clip();
    ctx.imageSmoothingEnabled = this.style === "realistic";
    ctx.drawImage(this.buffer, 0, 0, side, side);
    ctx.restore();
    // Rim and "you are here" (centre): ink hairlines.
    ctx.strokeStyle = this.theme.ink;
    ctx.lineWidth = dpr;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, side / 2 - dpr * 0.5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const c = side / 2;
    const r = 3.5 * dpr;
    ctx.fillStyle = this.style === "realistic" ? "#000" : this.theme.base;
    ctx.beginPath();
    ctx.arc(c, c, r + dpr, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = this.theme.ink;
    ctx.beginPath();
    ctx.arc(c, c, dpr * 1.2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
