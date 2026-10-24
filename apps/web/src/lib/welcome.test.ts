import { describe, expect, it } from "vitest";
import {
  WELCOME_KEY,
  WELCOME_START,
  endWelcome,
  gestureMade,
  isWelcomeRecord,
  viewSeparation,
  welcomeOnLaunch,
  welcomeReduce,
  type WelcomeEvent,
  type WelcomeState,
} from "./welcome";

/** In-memory Storage, enumerable like localStorage. */
function memory(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const launch = { param: null, automated: false, now: new Date("2026-10-24T20:30:00Z") };
const record = (store: ReturnType<typeof memory>) =>
  JSON.parse(store.map.get(WELCOME_KEY) ?? "null") as unknown;

describe("welcome shown once (#207)", () => {
  it("is shown on a fresh install, and recorded at once", () => {
    const store = memory();
    expect(welcomeOnLaunch(store, launch)).toBe(true);
    expect(record(store)).toEqual({ version: 1, outcome: "shown", at: "2026-10-24T20:30:00.000Z" });
    expect(isWelcomeRecord(record(store))).toBe(true);
  });

  it("never comes back on the next launches: closed midway, completed, skipped or put off", () => {
    const interrupted = memory();
    welcomeOnLaunch(interrupted, launch);
    // The first launch then stores its settings, as every launch does.
    interrupted.setItem("asteria.night", "false");
    expect(welcomeOnLaunch(interrupted, launch)).toBe(false);

    for (const outcome of ["done", "skipped", "later"] as const) {
      const store = memory();
      expect(welcomeOnLaunch(store, launch)).toBe(true);
      endWelcome(store, outcome, launch.now);
      expect((record(store) as { outcome: string }).outcome).toBe(outcome);
      expect(welcomeOnLaunch(store, launch)).toBe(false);
      expect(welcomeOnLaunch(store, launch)).toBe(false);
    }
  });

  it("is not shown to someone who used the app before it existed, and remembers it", () => {
    for (const key of [
      "asteria.night",
      "asteria.prefs.level",
      "asteria.level",
      "asteria.place",
      "asteria.games.progress",
    ]) {
      const store = memory({ [key]: "1" });
      expect(welcomeOnLaunch(store, launch), key).toBe(false);
      expect((record(store) as { outcome: string }).outcome).toBe("returning");
      // Even if those settings are later cleared, the record stays.
      store.map.delete(key);
      expect(welcomeOnLaunch(store, launch)).toBe(false);
    }
  });

  it("ignores other sites' and tools' keys", () => {
    expect(welcomeOnLaunch(memory({ "vite:hmr": "1", theme: "dark" }), launch)).toBe(true);
  });

  it("any record means seen, even one a later version wrote", () => {
    const store = memory({ [WELCOME_KEY]: JSON.stringify({ version: 2, outcome: "new" }) });
    expect(welcomeOnLaunch(store, launch)).toBe(false);
    expect(welcomeOnLaunch(memory({ [WELCOME_KEY]: "garbage" }), launch)).toBe(false);
  });

  it("is not shown without storage (it could not be remembered)", () => {
    expect(welcomeOnLaunch(null, launch)).toBe(false);
    const blocked = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(welcomeOnLaunch(blocked, launch)).toBe(false);
    const readOnly = { ...memory(), setItem: () => {} };
    expect(welcomeOnLaunch(readOnly, launch)).toBe(false);
    expect(() => endWelcome(null, "done")).not.toThrow();
  });

  it("captures: ?welcome=1 forces it, ?welcome=0 hides it, automation hides it unless asked", () => {
    const used = memory({ "asteria.night": "true" });
    expect(welcomeOnLaunch(used, { ...launch, param: "1" })).toBe(true);
    expect(welcomeOnLaunch(memory(), { ...launch, param: "0" })).toBe(false);
    const bot = memory();
    expect(welcomeOnLaunch(bot, { ...launch, automated: true })).toBe(false);
    expect(bot.map.size).toBe(0); // untouched: other captures stay as they are
    expect(welcomeOnLaunch(bot, { ...launch, automated: true, param: "auto" })).toBe(true);
    expect(welcomeOnLaunch(bot, { ...launch, automated: true, param: "auto" })).toBe(false);
  });
});

describe("welcome steps", () => {
  const run = (events: WelcomeEvent[], from: WelcomeState = WELCOME_START) =>
    events.reduce(welcomeReduce, from);

  it("goes place → level → drag → pinch → tap → end, done", () => {
    let s = WELCOME_START;
    const seen = [s.step];
    for (const e of [
      { type: "next" },
      { type: "next" },
      { type: "gesture", gesture: "drag" },
      { type: "gesture", gesture: "pinch" },
      { type: "gesture", gesture: "tap" },
    ] as WelcomeEvent[]) {
      s = welcomeReduce(s, e);
      seen.push(s.step);
    }
    expect(seen).toEqual(["place", "level", "drag", "pinch", "tap", "end"]);
    expect(s.outcome).toBe("done");
  });

  it("« Passer » ends it from the sheet, skipped", () => {
    expect(run([{ type: "skip" }])).toEqual({ step: "end", outcome: "skipped" });
    expect(run([{ type: "next" }, { type: "skip" }])).toEqual({ step: "end", outcome: "skipped" });
  });

  it("« Plus tard » ends the hints, put off; no « Passer » there", () => {
    const drag = run([{ type: "next" }, { type: "next" }]);
    expect(drag.step).toBe("drag");
    expect(welcomeReduce(drag, { type: "later" })).toEqual({ step: "end", outcome: "later" });
    expect(welcomeReduce(drag, { type: "skip" })).toBe(drag);
    expect(welcomeReduce(WELCOME_START, { type: "later" })).toBe(WELCOME_START);
  });

  it("a gesture counts for its own hint only, and not during the sheet", () => {
    expect(run([{ type: "gesture", gesture: "drag" }])).toEqual(WELCOME_START);
    const drag = run([{ type: "next" }, { type: "next" }]);
    expect(welcomeReduce(drag, { type: "gesture", gesture: "pinch" })).toBe(drag);
    expect(welcomeReduce(drag, { type: "gesture", gesture: "tap" })).toBe(drag);
    expect(welcomeReduce(drag, { type: "next" })).toBe(drag);
  });

  it("stays ended", () => {
    const end = run([{ type: "skip" }]);
    for (const e of [{ type: "next" }, { type: "later" }] as WelcomeEvent[])
      expect(welcomeReduce(end, e)).toBe(end);
  });
});

describe("gestures on the map", () => {
  const at = { azimuth: 180, altitude: 35, fov: 100 };

  it("measures how far the view's centre moved", () => {
    expect(viewSeparation(at, { ...at, altitude: 45 })).toBeCloseTo(10, 9);
    expect(viewSeparation(at, { ...at, azimuth: 190 })).toBeCloseTo(8.19, 2); // 10° × cos 35°
    expect(viewSeparation({ ...at, altitude: 90 }, { ...at, altitude: 90, azimuth: 0 })).toBe(0);
  });

  it("a drag is 10° of sky; zooming alone is not a drag", () => {
    expect(gestureMade("drag", at, { ...at, altitude: 44 })).toBe(false);
    expect(gestureMade("drag", at, { ...at, altitude: 46 })).toBe(true);
    expect(gestureMade("drag", at, { ...at, azimuth: 200 })).toBe(true);
    expect(gestureMade("drag", at, { ...at, fov: 30 })).toBe(false);
  });

  it("a pinch changes the field by 25 %, in or out; panning alone is not a pinch", () => {
    expect(gestureMade("pinch", at, { ...at, fov: 85 })).toBe(false);
    expect(gestureMade("pinch", at, { ...at, fov: 80 })).toBe(true);
    expect(gestureMade("pinch", at, { ...at, fov: 125 })).toBe(true);
    expect(gestureMade("pinch", at, { ...at, azimuth: 300 })).toBe(false);
    expect(gestureMade("tap", at, { ...at, fov: 20 })).toBe(false);
  });
});
