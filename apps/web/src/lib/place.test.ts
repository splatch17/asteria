import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLACE,
  farFromDeviceClock,
  isChosenPlace,
  loadPlace,
  PLACE_KEY,
  savePlace,
  toPlace,
} from "./place";

const store = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("place", () => {
  it("defaults to Paris without storage, without a record or with a broken one", () => {
    expect(loadPlace(null)).toEqual(DEFAULT_PLACE);
    expect(loadPlace(store())).toEqual(DEFAULT_PLACE);
    expect(loadPlace(store({ [PLACE_KEY]: "{" }))).toEqual(DEFAULT_PLACE);
    expect(
      loadPlace(store({ [PLACE_KEY]: '{"name":"mine","latitude":"x","longitude":2}' })),
    ).toEqual(DEFAULT_PLACE);
    expect(
      loadPlace(store({ [PLACE_KEY]: '{"name":"mine","latitude":95,"longitude":2}' })),
    ).toEqual(DEFAULT_PLACE);
  });

  it("reads the records written before the city picker", () => {
    expect(toPlace({ name: "mine", latitude: 4.93, longitude: -52.33 })).toEqual({
      name: "mine",
      latitude: 4.93,
      longitude: -52.33,
    });
    expect(toPlace({ name: null, latitude: 48.8566, longitude: 2.3522 })).toEqual(DEFAULT_PLACE);
  });

  it("keeps a city with its name, and the coordinates of anything else", () => {
    const lyon = { name: "city", label: "Lyon", latitude: 45.77, longitude: 4.83 };
    expect(toPlace(lyon)).toEqual(lyon);
    expect(toPlace({ name: "city", latitude: 45.77, longitude: 4.83 })).toEqual({
      name: "custom",
      latitude: 45.77,
      longitude: 4.83,
    });
    expect(toPlace({ name: "moon-base", latitude: 1, longitude: 2 })?.name).toBe("custom");
    expect(toPlace("Lyon")).toBeNull();
  });

  it("reads back what was saved and survives a storage that throws", () => {
    const s = store();
    const lyon = { name: "city" as const, label: "Lyon", latitude: 45.77, longitude: 4.83 };
    savePlace(s, lyon);
    expect(loadPlace(s)).toEqual(lyon);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadPlace(broken)).toEqual(DEFAULT_PLACE);
    expect(() => savePlace(broken, lyon)).not.toThrow();
  });

  it("flags a place whose local time is far from the device's clock", () => {
    const PARIS_WINTER = -60; // UTC+1
    const PARIS_SUMMER = -120; // UTC+2
    expect(farFromDeviceClock(2.35, PARIS_WINTER)).toBe(false); // Paris
    expect(farFromDeviceClock(4.83, PARIS_SUMMER)).toBe(false); // Lyon in summer
    expect(farFromDeviceClock(-4.49, PARIS_SUMMER)).toBe(false); // Brest, solar time 2 h 18 behind
    expect(farFromDeviceClock(151.21, PARIS_WINTER)).toBe(true); // Sydney
    expect(farFromDeviceClock(-73.59, PARIS_WINTER)).toBe(true); // Montréal
    expect(farFromDeviceClock(-52.33, PARIS_WINTER)).toBe(true); // Cayenne
    // Across the date line: Auckland (UTC+12) seen from Honolulu (UTC−10) is 2 hours away.
    expect(farFromDeviceClock(174.76, 600)).toBe(false);
  });

  it("tells a chosen place from the default one", () => {
    expect(isChosenPlace(DEFAULT_PLACE)).toBe(false);
    expect(isChosenPlace({ name: "custom", latitude: 0, longitude: 0 })).toBe(true);
  });
});
