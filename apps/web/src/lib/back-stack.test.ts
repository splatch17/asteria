import { describe, expect, it } from "vitest";
import { BackStack, type HistoryLike } from "./back-stack";

/** A browser history: entries, an index, popstate delivered later (as browsers do). */
class FakeHistory implements HistoryLike {
  entries: unknown[] = [null];
  index = 0;
  private due: number[] = [];
  pushState(data: unknown) {
    this.entries.splice(this.index + 1, Infinity, data);
    this.index++;
  }
  go(delta: number) {
    this.due.push(delta);
  }
  /** The person presses back. */
  back() {
    this.due.push(-1);
  }
  /** Delivers the traversals asked, one popstate each. */
  run(stack: BackStack) {
    while (this.due.length) {
      const d = this.due.shift()!;
      this.index = Math.max(0, this.index + d);
      stack.onPop();
    }
  }
}

describe("Android back closes the layer on top (#176)", () => {
  it("closes the layers one by one, top first", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    const closed: string[] = [];
    s.open("learn", () => closed.push("learn"));
    s.open("latitude", () => closed.push("latitude"));
    s.open("latitude-map", () => closed.push("latitude-map"));
    expect(h.index).toBe(3);
    h.back();
    h.run(s);
    expect(closed).toEqual(["latitude-map"]);
    h.back();
    h.run(s);
    expect(closed).toEqual(["latitude-map", "latitude"]);
    expect(s.ids).toEqual(["learn"]);
  });

  it("takes back the entry of a layer closed by its ×, without closing another", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    const closed: string[] = [];
    s.open("sheet", () => closed.push("sheet"));
    s.closed("sheet");
    h.run(s);
    expect(closed).toEqual([]);
    expect(h.index).toBe(0);
    expect(s.ids).toEqual([]);
  });

  it("closes the layers over one closed by the interface with it", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    s.open("learn", () => {});
    s.open("game", () => {});
    s.closed("learn");
    h.run(s);
    expect(h.index).toBe(0);
    expect(s.ids).toEqual([]);
  });

  it("pushes a layer opened right after another closed only once the traversal is done", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    const closed: string[] = [];
    s.open("sheet", () => closed.push("sheet"));
    // A choice of the sheet closes it and opens the time line in the same tap.
    s.closed("sheet");
    s.open("time", () => closed.push("time"));
    expect(h.index).toBe(1); // not pushed yet
    h.run(s);
    expect(h.index).toBe(1); // back to 0, then the time line pushed
    h.back();
    h.run(s);
    expect(closed).toEqual(["time"]);
  });

  it("drops a queued entry when its layer closes before it was pushed", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    s.open("sheet", () => {});
    s.closed("sheet");
    s.open("time", () => {});
    s.closed("time");
    h.run(s);
    expect(h.index).toBe(0);
    expect(s.ids).toEqual([]);
  });

  it("takes back two layers closed in a row with one traversal at a time", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    const closed: string[] = [];
    s.open("orbits", () => closed.push("orbits"));
    s.open("sheet", () => closed.push("sheet"));
    // « Observer » in the sheet: the sheet closes, then the Earth view.
    s.closed("sheet");
    s.closed("orbits");
    h.run(s);
    expect(h.index).toBe(0);
    expect(closed).toEqual([]);
  });

  it("steps back over the entries of a reload, without closing anything", () => {
    const h = new FakeHistory();
    h.pushState({});
    h.pushState({});
    const s = new BackStack(h);
    const closed: string[] = [];
    s.rewind(2);
    s.open("sheet", () => closed.push("sheet"));
    h.run(s);
    expect(h.index).toBe(1);
    expect(closed).toEqual([]);
  });

  it("ignores a second opening of the same layer and a close of one already gone", () => {
    const h = new FakeHistory();
    const s = new BackStack(h);
    s.open("sheet", () => {});
    s.open("sheet", () => {});
    expect(h.index).toBe(1);
    h.back();
    h.run(s);
    s.closed("sheet");
    h.run(s);
    expect(h.index).toBe(0);
  });
});
