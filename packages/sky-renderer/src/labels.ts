/** Greedy screen-space label placement: first come, first served, with fallback positions. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PADDING = 2;

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x - PADDING < b.x + b.w &&
    b.x - PADDING < a.x + a.w &&
    a.y - PADDING < b.y + b.h &&
    b.y - PADDING < a.y + a.h
  );
}

export class LabelLayout {
  private readonly placed: Rect[] = [];

  /** Places the first candidate that collides with nothing already placed; null if none fits. */
  place(candidates: Rect[]): Rect | null {
    for (const c of candidates) {
      if (!this.placed.some((p) => overlaps(p, c))) {
        this.placed.push(c);
        return c;
      }
    }
    return null;
  }
}
