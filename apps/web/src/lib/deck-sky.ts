/**
 * One sky for the whole catalogue deck (#196). A single SkyMap (one WebGL context, shaders and
 * star buffers built once) whose two canvases move into the card centred in the deck; the other
 * cards show a still picture of their sky, drawn by the same map between two frames and copied
 * (drawImage) before the browser shows the canvas again. A card with no picture yet shows its
 * sketch (lib/card-sketch), drawn by the card itself.
 */
import type { Observer } from "@asteria/astro-core";
import {
  SkyMap,
  type CatalogStar,
  type FigureLevel,
  type SkyLayers,
  type SkyTheme,
} from "@asteria/sky-renderer";

/** What a card shows of the sky: everything the shared map needs to draw it. */
export interface CardSky {
  abbr: string;
  /** Made-up observer with the figure at the zenith (lib/games/geometry zenithObserver). */
  observer: Observer;
  /** Field framing the figure in the card's picture (degrees). */
  fov: number;
  /** Illustrated figure shown. */
  figures: boolean;
  /** Star marked by the reticle. */
  star: CatalogStar | null;
}

/** A card mounted in the deck. */
export interface DeckCard {
  /** The card's sky as it is now. */
  sky: () => CardSky;
  /** Where the live canvases go when the card is centred. */
  stage: HTMLElement;
  /** The card's own 2D canvas, under the live ones: still picture or sketch. */
  still: HTMLCanvasElement;
  /** Draws the card's sketch on `still` (no picture yet, or the theme changed). */
  sketch: (theme: SkyTheme) => void;
}

export interface DeckSkyOptions {
  stars: CatalogStar[];
  lines: Record<string, number[][]>;
  names: Readonly<Record<string, string>>;
  theme: SkyTheme;
  figureSet: string;
  level: FigureLevel;
  date: Date;
}

/** Outcome of `prepare`: drawn, nothing to do, or to try again later (figures loading). */
export type Prepared = "drawn" | "none" | "later";

/** Pictures kept: the deck's window (5 cards) and a few behind it. */
const KEPT = 9;

/** Size in device pixels of a canvas laid out at `w` × `h` CSS px (as three.js sizes it). */
export const devicePixels = (css: number, ratio: number) => Math.floor(css * ratio);

/** Identifies a still picture: the card, what it shows and its size. */
export function stillKey(v: CardSky, width: number, height: number): string {
  return `${v.abbr}|${v.figures ? 1 : 0}|${v.star?.hip ?? 0}|${v.fov.toFixed(3)}|${width}x${height}`;
}

/** The sky map's theme for a card: no daylight, no ground (the figure is at the zenith). */
const cardTheme = (theme: SkyTheme): SkyTheme => ({
  ...theme,
  daySky: theme.sky,
  ground: theme.sky,
});

export class DeckSky {
  private readonly canvas = liveCanvas();
  private readonly overlay = liveCanvas();
  private map: SkyMap | null = null;
  private failed = false;
  private readonly cards = new Map<string, DeckCard>();
  /** Still pictures by key, the most recently used last. */
  private readonly pictures = new Map<string, HTMLCanvasElement>();
  private live: string | null = null;
  private theme: SkyTheme;

  constructor(private readonly options: DeckSkyOptions) {
    this.theme = options.theme;
  }

  /** No WebGL: the cards keep their sketch and their text. */
  get unavailable(): boolean {
    return this.failed;
  }

  /** The theme the pictures and sketches are drawn in. */
  get currentTheme(): SkyTheme {
    return this.theme;
  }

  /** A card mounted: it shows its picture if one is kept, else its sketch. Returns the removal. */
  register(abbr: string, card: DeckCard): () => void {
    this.cards.set(abbr, card);
    if (!this.paintKept(card)) card.sketch(this.theme);
    return () => {
      if (this.cards.get(abbr) !== card) return;
      this.cards.delete(abbr);
      if (this.live === abbr) {
        this.live = null;
        this.canvas.remove();
        this.overlay.remove();
      }
    };
  }

  /**
   * Moves the live sky into card `abbr` (the one the deck rests on) and draws it at once; the card
   * it leaves keeps a still picture of its last state. False without WebGL or without that card.
   */
  setLive(abbr: string): boolean {
    if (abbr === this.live && this.map) return true;
    const card = this.cards.get(abbr);
    if (!card || this.failed) return false;
    const previous = this.live ? this.cards.get(this.live) : undefined;
    if (previous && this.map && !this.paintKept(previous)) this.capture(previous);
    this.live = abbr;
    card.stage.append(this.canvas, this.overlay);
    if (!this.map && !this.create()) return false;
    this.apply(card.sky());
    this.map!.renderNow();
    return true;
  }

  /** The live card changed (a star touched, the figure, its size): drawn at the next frame. */
  refresh(abbr: string): void {
    const card = this.cards.get(abbr);
    if (abbr === this.live && card && this.map) this.apply(card.sky());
  }

  /**
   * Draws the still picture of card `abbr` if it shows something else (or a sketch): two frames
   * of the shared map in one task, the card's then the live card's again.
   */
  prepare(abbr: string): Prepared {
    const card = this.cards.get(abbr);
    const live = this.live ? this.cards.get(this.live) : undefined;
    if (!card || !live || !this.map || abbr === this.live) return "none";
    if (this.paintKept(card)) return "none";
    if (card.sky().figures && this.map.figureLayer.loading) return "later";
    this.capture(card);
    this.apply(live.sky());
    this.map.renderNow();
    return "drawn";
  }

  /** Night vision on or off: pictures are redrawn, sketches meanwhile. */
  setTheme(theme: SkyTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.pictures.clear();
    this.map?.setTheme(cardTheme(theme));
    for (const [abbr, card] of this.cards)
      if (abbr !== this.live) {
        delete card.still.dataset.picture;
        card.sketch(theme);
      }
  }

  dispose(): void {
    this.map?.dispose();
    this.map = null;
    this.canvas.remove();
    this.overlay.remove();
    this.pictures.clear();
    this.cards.clear();
  }

  private create(): boolean {
    const { stars, lines, names, figureSet, level, date } = this.options;
    try {
      this.map = new SkyMap({
        canvas: this.canvas,
        overlay: this.overlay,
        stars,
        lines,
        constellationNames: names as Record<string, string>,
        theme: cardTheme(this.theme),
        figureSet,
        layers: {
          starNames: true,
          planets: false,
          allPaths: false,
          equatorialGrid: false,
          azimuthalGrid: false,
          ecliptic: false,
          seeThroughGround: true,
          deepSky: false,
          milkyWay: false,
          constellationLines: true,
          constellationNames: false,
        } satisfies Partial<SkyLayers>,
      });
    } catch (e) {
      console.error(e); // no WebGL: the cards keep their sketch
      this.failed = true;
      this.canvas.remove();
      this.overlay.remove();
      return false;
    }
    this.map.setDate(date);
    this.map.figureLayer.setLevel(level);
    return true;
  }

  /** Sets the shared map to draw a card's sky. */
  private apply(v: CardSky): void {
    const map = this.map!;
    map.setObserver(v.observer);
    map.setLayers({ constellationFigures: v.figures });
    map.setSelection(v.star ? { kind: "star", star: v.star } : null);
    map.setSelectedConstellation(v.abbr);
    map.setView({ azimuth: 180, altitude: 90, roll: 0, fov: v.fov });
  }

  /** The key of a card's picture at the live canvases' size. */
  private keyOf(card: DeckCard): string {
    const ratio = Math.min(devicePixelRatio, 2);
    return stillKey(
      card.sky(),
      devicePixels(card.stage.clientWidth, ratio),
      devicePixels(card.stage.clientHeight, ratio),
    );
  }

  /** Shows the kept picture of the card's present state; false if there is none. */
  private paintKept(card: DeckCard): boolean {
    const key = this.keyOf(card);
    if (card.still.dataset.picture === key) return true;
    const picture = this.pictures.get(key);
    if (!picture) return false;
    this.pictures.delete(key); // most recently used last
    this.pictures.set(key, picture);
    copy(picture, card.still);
    card.still.dataset.picture = key;
    return true;
  }

  /** Draws a card with the shared map and keeps the picture (the live card is drawn after). */
  private capture(card: DeckCard): void {
    const map = this.map!;
    this.apply(card.sky());
    map.renderNow();
    const key = this.keyOf(card);
    let picture = this.pictures.get(key);
    if (!picture) {
      if (this.pictures.size >= KEPT) {
        const oldest = this.pictures.keys().next().value!;
        picture = this.pictures.get(oldest)!;
        this.pictures.delete(oldest);
      } else picture = document.createElement("canvas");
    }
    picture.width = this.canvas.width;
    picture.height = this.canvas.height;
    const ctx = picture.getContext("2d")!;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.drawImage(this.overlay, 0, 0, picture.width, picture.height);
    this.pictures.set(key, picture);
    copy(picture, card.still);
    card.still.dataset.picture = key;
  }
}

function liveCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.setAttribute("aria-hidden", "true");
  // A still picture: taps go to the stage, scrolling to the card.
  c.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  return c;
}

function copy(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
  if (to.width !== from.width) to.width = from.width;
  if (to.height !== from.height) to.height = from.height;
  const ctx = to.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, to.width, to.height);
  ctx.drawImage(from, 0, 0);
}
