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
  private readonly reserved: Rect[] = [];
  private readonly placed: Rect[] = [];

  /**
   * `reserved`: areas no label may cover, whatever its priority (e.g. the HUD: header,
   * buttons, time controls).
   */
  constructor(reserved: readonly Rect[] = []) {
    this.reserve(reserved);
  }

  /** Marks areas as occupied (e.g. HUD panels): later labels avoid them. */
  reserve(rects: readonly Rect[]): void {
    for (const r of rects) if (r.w > 0 && r.h > 0) this.reserved.push(r);
  }

  /** True if `r` covers neither a reserved area nor an already placed label. */
  isFree(r: Rect): boolean {
    return !this.reserved.some((p) => overlaps(p, r)) && !this.placed.some((p) => overlaps(p, r));
  }

  /** Places the first candidate that collides with nothing already placed; null if none fits. */
  place(candidates: readonly Rect[]): Rect | null {
    for (const c of candidates) {
      if (this.isFree(c)) {
        this.placed.push(c);
        return c;
      }
    }
    return null;
  }

  /**
   * Marks an area as occupied (e.g. a planet's disc) without requiring it to be free:
   * later labels avoid it. Parts lying under reserved areas change nothing.
   */
  occupy(r: Rect): void {
    this.placed.push(r);
  }
}
