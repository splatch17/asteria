/**
 * Android and browser back (#176): every sheet, line or screen opened over the sky pushes one
 * history entry; back closes the one on top. Closed from the interface (×, Escape, a choice), its
 * entry is taken back silently, so that the next back closes the next layer, not nothing.
 *
 * Kept free of `window` (a small `HistoryLike` is passed in) so that it can be tested.
 */

export interface HistoryLike {
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

interface Entry {
  id: string;
  close: () => void;
}

/** Marks Asteria's own entries in `history.state`. */
export const BACK_STATE = "asteria-layer";

export class BackStack {
  private stack: Entry[] = [];
  /** A traversal asked by `closed` or `rewind` whose popstate has not arrived yet. */
  private pending = false;
  /**
   * Entries to take back once it has: one traversal at a time, since a second `history.go`
   * issued before the first is done may be dropped by the browser.
   */
  private deferred = 0;
  /** Pushes waiting for the traversals (a push before them would be undone). */
  private queued = 0;

  constructor(private readonly history: HistoryLike) {}

  /** Layers open, bottom first (for tests and captures). */
  get ids(): string[] {
    return this.stack.map((e) => e.id);
  }

  /** A layer opened: one history entry; back will call `close`. */
  open(id: string, close: () => void): void {
    if (this.stack.some((e) => e.id === id)) return;
    this.stack.push({ id, close });
    if (this.pending) this.queued++;
    else this.history.pushState({ [BACK_STATE]: this.stack.length }, "");
  }

  /**
   * A layer closed from the interface: its entry (and those of layers opened over it, closed with
   * it) is taken back without closing anything else.
   */
  closed(id: string): void {
    const i = this.stack.findIndex((e) => e.id === id);
    if (i < 0) return; // already closed by back
    const n = this.stack.length - i;
    this.stack.splice(i);
    // The layers on top whose entries still wait to be pushed are simply dropped.
    const dropped = Math.min(n, this.queued);
    this.queued -= dropped;
    this.goBack(n - dropped);
  }

  /** Steps back over `n` entries left by an earlier page (a reload with layers open). */
  rewind(n: number): void {
    this.goBack(n);
  }

  private goBack(n: number): void {
    if (n <= 0) return;
    if (this.pending) {
      this.deferred += n;
      return;
    }
    this.pending = true;
    this.history.go(-n);
  }

  /** The browser went back (popstate). */
  onPop(): void {
    if (this.pending) {
      this.pending = false;
      const more = this.deferred;
      this.deferred = 0;
      if (more > 0) this.goBack(more);
      else this.flush();
      return;
    }
    const top = this.stack.pop();
    top?.close();
  }

  private flush(): void {
    const base = this.stack.length - this.queued;
    for (let k = 1; k <= this.queued; k++) this.history.pushState({ [BACK_STATE]: base + k }, "");
    this.queued = 0;
  }
}
