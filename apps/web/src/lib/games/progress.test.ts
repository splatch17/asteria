import { describe, expect, it } from "vitest";
import {
  PROGRESS_KEY,
  countMastery,
  emptyProgress,
  isSeen,
  itemKey,
  loadProgress,
  markSeen,
  parseProgress,
  recordAnswer,
  recordGame,
  saveProgress,
  type KeyValueStore,
} from "./progress";
import { DAY_MS } from "./srs";

const T0 = Date.UTC(2026, 9, 19, 20);

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("progress", () => {
  it("keys items by kind", () => {
    expect(itemKey("con", "Ori")).toBe("con:Ori");
    expect(itemKey("star", 32349)).toBe("star:32349");
  });

  it("records answers without touching the input", () => {
    const p0 = emptyProgress();
    const p1 = recordAnswer(p0, "con:Ori", true, T0);
    expect(p0.items).toEqual({});
    expect(p1.items["con:Ori"]?.correct).toBe(1);
    const p2 = recordGame(recordGame(p1, "g", 7), "g", 5);
    expect(p2.games.g).toEqual({ played: 2, best: 7 });
  });

  it("saves and loads through storage (versioned JSON)", () => {
    const store = memoryStore();
    const p = recordAnswer(emptyProgress(), "con:Lyr", false, T0);
    expect(saveProgress(p, store)).toBe(true);
    expect(JSON.parse(store.data.get(PROGRESS_KEY)!).version).toBe(2);
    expect(loadProgress(store)).toEqual(p);
  });

  it("starts afresh on missing, broken, foreign or future data", () => {
    const store = memoryStore();
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.data.set(PROGRESS_KEY, "{not json");
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.data.set(PROGRESS_KEY, JSON.stringify({ version: 99, items: { "con:Ori": {} } }));
    expect(loadProgress(store)).toEqual(emptyProgress());
    expect(parseProgress("x")).toEqual(emptyProgress());
  });

  it("drops malformed records and unknown keys", () => {
    const good = recordAnswer(emptyProgress(), "con:Ori", true, T0).items["con:Ori"];
    const p = parseProgress({
      version: 1,
      items: { "con:Ori": good, "con:Bad": { reps: "1" }, other: good },
      games: { g: { played: 2, best: 9 }, h: { played: "x" } },
    });
    expect(Object.keys(p.items)).toEqual(["con:Ori"]);
    expect(p.games).toEqual({ g: { played: 2, best: 9 } });
  });

  it("reads version 1 (#163) as version 2 with nothing seen", () => {
    const good = recordAnswer(emptyProgress(), "con:Ori", true, T0).items["con:Ori"]!;
    const p = parseProgress({ version: 1, items: { "con:Ori": good }, games: {} });
    expect(p.version).toBe(2);
    expect(p.items["con:Ori"]).toEqual(good);
    expect(p.seen).toEqual({});
  });

  it("marks pages seen without touching the review schedule (#170)", () => {
    const p0 = recordAnswer(emptyProgress(), "con:Ori", false, T0);
    const p1 = markSeen(p0, "con:Ori", T0 + 1000);
    expect(isSeen(p0, "con:Ori")).toBe(false);
    expect(isSeen(p1, "con:Ori")).toBe(true);
    expect(p1.items).toBe(p0.items);
    // The first time is kept, and nothing changes the second time.
    expect(markSeen(p1, "con:Ori", T0 + 5000)).toBe(p1);
    const store = memoryStore();
    saveProgress(p1, store);
    expect(loadProgress(store)).toEqual(p1);
    expect(
      parseProgress({ version: 2, items: {}, games: {}, seen: { "con:Lyr": "x", x: 1 } }).seen,
    ).toEqual({});
  });

  it("never throws when storage is unavailable", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadProgress(broken)).toEqual(emptyProgress());
    expect(saveProgress(emptyProgress(), broken)).toBe(false);
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(saveProgress(emptyProgress(), null)).toBe(false);
  });

  it("counts mastery over a set of items", () => {
    let p = recordAnswer(emptyProgress(), "con:Ori", true, T0);
    p = recordAnswer(p, "con:Lyr", false, T0);
    p = recordAnswer(p, "con:Cyg", true, T0);
    p = recordAnswer(p, "con:Cyg", true, T0 + DAY_MS);
    p = recordAnswer(p, "con:Cyg", true, T0 + 4 * DAY_MS);
    expect(countMastery(p, ["con:Ori", "con:Lyr", "con:Cyg", "con:Aql"])).toEqual({
      new: 1,
      learning: 1,
      known: 1,
      mastered: 1,
      total: 4,
    });
  });
});
