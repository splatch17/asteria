/**
 * A card's sketch (#196): the stars of the field and the figure's lines drawn in 2D, in the sky's
 * two colours, while
 * the shared sky map (lib/deck-sky) has not yet drawn the card's still picture — a card met in the
 * middle of a fling. Less than a millisecond, and the same projection as the map, so the figure
 * sits where the picture will put it.
 */
import type { SkyTheme } from "@asteria/sky-renderer";

export interface SketchStar {
  hip: number;
  /** CSS px in the picture. */
  x: number;
  y: number;
  v: number;
}

/** Radius (CSS px) of a star of magnitude `v`: brighter, larger, within readable bounds. */
export function sketchRadius(v: number): number {
  return Math.min(3.2, Math.max(0.9, 2.6 - 0.36 * v));
}

/** Opacity of the figure's lines, as the map draws a selected constellation's. */
export const SKETCH_LINE_ALPHA = 0.85;
/** Opacity of the stars around the figure: the map's faint field, under the figure. */
export const SKETCH_FIELD_ALPHA = 0.7;

/**
 * Draws the sketch on a 2D context scaled to CSS px (`w` × `h`): the sky, the `field` stars faint,
 * the figure's lines between its projected `stars`, then those stars in full ink.
 */
export function drawSketch(
  ctx: Pick<
    CanvasRenderingContext2D,
    | "fillStyle"
    | "strokeStyle"
    | "globalAlpha"
    | "lineWidth"
    | "fillRect"
    | "beginPath"
    | "moveTo"
    | "lineTo"
    | "stroke"
    | "arc"
    | "fill"
  >,
  w: number,
  h: number,
  stars: readonly SketchStar[],
  figure: readonly (readonly number[])[],
  theme: Pick<SkyTheme, "sky" | "ink">,
  field: readonly SketchStar[] = [],
): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = SKETCH_FIELD_ALPHA;
  for (const s of field) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, sketchRadius(s.v), 0, 2 * Math.PI);
    ctx.fill();
  }
  const at = new Map(stars.map((s) => [s.hip, s]));
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;
  ctx.globalAlpha = SKETCH_LINE_ALPHA;
  ctx.beginPath();
  for (const line of figure)
    for (let i = 1; i < line.length; i++) {
      const a = at.get(line[i - 1]!);
      const b = at.get(line[i]!);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  ctx.stroke();
  // The figure's stars over the lines, ringed with sky as the map draws them.
  ctx.globalAlpha = 1;
  for (const s of stars) {
    const r = sketchRadius(s.v) + 0.6;
    ctx.fillStyle = theme.sky;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 1.4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
}
