import { describe, expect, it } from "vitest";
import {
  PROGRESS_KEY,
  bestScore,
  countMastery,
  emptyProgress,
  isSeen,
  itemKey,
  loadProgress,
  markSeen,
  parseProgress,
  recordAnswer,
  recordGame,
  recordKey,
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
    const key = recordKey("g", "training", "amateur");
    const p2 = recordGame(recordGame(p1, key, 7), key, 5);
    expect(p2.records[key]).toEqual({ played: 2, best: 7 });
    expect(bestScore(p2, key)).toBe(7);
    expect(bestScore(p2, recordKey("g", "streak", "amateur"))).toBe(0);
  });

  it("keeps records apart by game, mode and level (#187)", () => {
    let p = emptyProgress();
    p = recordGame(p, recordKey("g", "streak", "expert"), 14);
    p = recordGame(p, recordKey("g", "timed", "expert"), 9);
    p = recordGame(p, recordKey("g", "streak", "discovery"), 3);
    p = recordGame(p, recordKey("h", "streak", "expert"), 2);
    expect(bestScore(p, "g:streak:expert")).toBe(14);
    expect(bestScore(p, "g:timed:expert")).toBe(9);
    expect(bestScore(p, "g:streak:discovery")).toBe(3);
    expect(bestScore(p, "h:streak:expert")).toBe(2);
    expect(bestScore(p, "g:training:expert")).toBe(0);
    const store = memoryStore();
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
  });

  it("saves and loads through storage (versioned JSON)", () => {
    const store = memoryStore();
    const p = recordAnswer(emptyProgress(), "con:Lyr", false, T0);
    expect(saveProgress(p, store)).toBe(true);
    expect(JSON.parse(store.data.get(PROGRESS_KEY)!).version).toBe(3);
    expect(loadProgress(store)).toEqual(p);
  });

  it("migrates version 2 records to training records at the player's level (#187)", () => {
    const good = recordAnswer(emptyProgress(), "con:Ori", true, T0).items["con:Ori"]!;
    const v2 = {
      version: 2,
      items: { "con:Ori": good },
      games: {
        whichConstellation: { played: 4, best: 8 },
        nameStar: { played: 1, best: 6 },
        connectStars: { played: 3, best: 4 },
        "bad key": { played: 1, best: 1 },
        whereIsIt: { played: "x", best: 1 },
      },
      seen: { "con:Lyr": T0 },
    };
    const p = parseProgress(v2, "expert");
    expect(p.version).toBe(3);
    expect(p.records).toEqual({
      "whichConstellation:training:expert": { played: 4, best: 8 },
      "nameStar:training:expert": { played: 1, best: 6 },
      "connectStars:training:expert": { played: 3, best: 4 },
    });
    expect(p.items["con:Ori"]).toEqual(good);
    expect(p.seen).toEqual({ "con:Lyr": T0 });
    expect(parseProgress(v2).records["whichConstellation:training:amateur"]?.best).toBe(8);
    // Written back at once: the level stays even if the player changes it later.
    const store = memoryStore();
    store.data.set(PROGRESS_KEY, JSON.stringify(v2));
    expect(loadProgress(store, "discovery").records["nameStar:training:discovery"]?.best).toBe(6);
    expect(JSON.parse(store.data.get(PROGRESS_KEY)!).version).toBe(3);
    expect(loadProgress(store, "expert").records["nameStar:training:expert"]).toBeUndefined();
    expect(loadProgress(store, "expert").records["nameStar:training:discovery"]?.best).toBe(6);
  });

  it("drops version 3 records with an unknown mode or level", () => {
    const p = parseProgress({
      version: 3,
      items: {},
      records: {
        "g:streak:expert": { played: 1, best: 5 },
        "g:sprint:expert": { played: 1, best: 5 },
        "g:streak:pro": { played: 1, best: 5 },
        "g:timed:amateur": { played: "1", best: 5 },
      },
      games: { g: { played: 1, best: 9 } }, // a v2 field in v3 data: ignored
      seen: {},
    });
    expect(p.records).toEqual({ "g:streak:expert": { played: 1, best: 5 } });
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
    expect(p.records).toEqual({ "g:training:amateur": { played: 2, best: 9 } });
  });

  it("reads version 1 (#163) as version 3 with nothing seen", () => {
    const good = recordAnswer(emptyProgress(), "con:Ori", true, T0).items["con:Ori"]!;
    const p = parseProgress({ version: 1, items: { "con:Ori": good }, games: {} });
    expect(p.version).toBe(3);
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
