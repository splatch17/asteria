import { describe, expect, it } from "vitest";
import { applyMat3, precessionMatrix, type SkyZone, type Vec3 } from "@asteria/astro-core";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { figureStars } from "./games/geometry";
import { HOME_MIN_ALTITUDE, HOME_MIN_SHARE, visibleFromLatitude } from "./games/visibility";
import {
  POLAR_CIRCLE,
  STEPS,
  TROPIC,
  classesKey,
  classifyFigures,
  easeInOut,
  formatDeclination,
  latitudeParts,
  listsByZone,
  nextStep,
  presetLatitude,
  tweenLatitude,
} from "./latitude";

describe("latitude as written", () => {
  it("gives the value to a tenth and the hemisphere", () => {
    expect(latitudeParts(48.8566)).toEqual({ value: "48,9", hemisphere: "N" });
    expect(latitudeParts(-33.87)).toEqual({ value: "33,9", hemisphere: "S" });
    expect(latitudeParts(0.02)).toEqual({ value: "0", hemisphere: "" });
    expect(latitudeParts(-90)).toEqual({ value: "90", hemisphere: "S" });
  });
  it("signs declinations with a true minus", () => {
    expect(formatDeclination(41.1434)).toBe("+41,1°");
    expect(formatDeclination(-41.1434)).toBe("−41,1°");
    expect(formatDeclination(0)).toBe("+0,0°");
  });
});

describe("motion", () => {
  it("eases a tween from one latitude to another", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(tweenLatitude(48.85, -90, 0)).toBe(48.85);
    expect(tweenLatitude(48.85, -90, 10_000)).toBe(-90);
    const mid = tweenLatitude(0, 90, 350);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(50);
  });

  it("steps through the notable latitudes with reduced motion, bouncing at the poles", () => {
    expect(STEPS).toContain(TROPIC);
    expect(STEPS).toContain(-POLAR_CIRCLE);
    expect(nextStep(48.85, true)).toEqual({ lat: 45, south: true });
    expect(nextStep(45, true)).toEqual({ lat: TROPIC, south: true });
    expect(nextStep(-POLAR_CIRCLE, true)).toEqual({ lat: -90, south: false });
    expect(nextStep(-90, false)).toEqual({ lat: -POLAR_CIRCLE, south: false });
    expect(nextStep(POLAR_CIRCLE, false)).toEqual({ lat: 90, south: true });
    expect(nextStep(90, true)).toEqual({ lat: POLAR_CIRCLE, south: true });
    // A whole tour from the north pole comes back to it.
    let s = { lat: 90, south: true };
    const seen: number[] = [];
    for (let i = 0; i < 16; i++) seen.push((s = nextStep(s.lat, s.south)).lat);
    expect(seen.at(-1)).toBe(90);
    expect(seen).toContain(-90);
  });

  it("opens the presets at their latitudes", () => {
    expect(presetLatitude("home", 48.8566)).toBe(48.8566);
    expect(presetLatitude("northPole", 0)).toBe(90);
    expect(presetLatitude("equator", 12)).toBe(0);
    expect(presetLatitude("southPole", 12)).toBe(-90);
  });
});

describe("lists", () => {
  const classes = {
    UMi: { zone: "always", partlyHidden: false, partlyAlways: false },
    Ori: { zone: "sometimes", partlyHidden: false, partlyAlways: false },
    UMa: { zone: "sometimes", partlyHidden: false, partlyAlways: true },
    Cru: { zone: "never", partlyHidden: false, partlyAlways: false },
    And: { zone: "sometimes", partlyHidden: false, partlyAlways: false },
  } as const;
  const names = {
    UMi: "Petite Ourse",
    Ori: "Orion",
    UMa: "Grande Ourse",
    Cru: "Croix du Sud",
    And: "Andromède",
  };

  it("groups by zone, sorted by French name", () => {
    const lists = listsByZone(classes, names);
    expect(lists.always.map((c) => c.abbr)).toEqual(["UMi"]);
    expect(lists.sometimes.map((c) => c.name)).toEqual(["Andromède", "Grande Ourse", "Orion"]);
    expect(lists.never.map((c) => c.abbr)).toEqual(["Cru"]);
    expect(lists.sometimes[1]!.partlyAlways).toBe(true);
  });

  it("keys the classes so that the lists are rebuilt only on a change", () => {
    const a = classesKey(classes);
    expect(classesKey({ ...classes })).toBe(a);
    expect(
      classesKey({ ...classes, Ori: { zone: "never", partlyHidden: false, partlyAlways: false } }),
    ).not.toBe(a);
    expect(
      classesKey({
        ...classes,
        UMa: { zone: "sometimes", partlyHidden: false, partlyAlways: false },
      }),
    ).not.toBe(a);
  });
});

// The lists' classes against the real figures (public/data, gitignored: skipped when absent).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs &&
  ["stars.bin", "star-strings.json", "constellation-lines.json"].every((f) =>
    fs.existsSync(data(f)),
  );

describe.skipIf(!available)("classes of the 88 figures (public/data)", () => {
  const load = () => {
    const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const stars = decodeStarCatalog(buffer, JSON.parse(text("star-strings.json")) as StarStrings);
    const lines = JSON.parse(text("constellation-lines.json")) as Record<string, number[][]>;
    return figureStars(stars, lines);
  };
  const DATE = new Date("2026-10-22T20:00:00Z");
  const P = precessionMatrix(DATE);
  const classify = (figures: ReturnType<typeof load>, lat: number) =>
    classifyFigures(
      figures,
      visibleFromLatitude(figures, lat, DATE),
      lat,
      P,
      HOME_MIN_ALTITUDE,
      HOME_MIN_SHARE,
    );
  const count = (c: ReturnType<typeof classify>, z: SkyZone) =>
    Object.values(c).filter((v) => v.zone === z).length;

  it("from Paris: the Little Bear always, the Cross never, Orion part of the year", () => {
    const c = classify(load(), 48.8566);
    expect(c.UMi!.zone).toBe("always");
    expect(c.Cas!.zone).toBe("always");
    expect(c.Cru!.zone).toBe("never");
    expect(c.Ori!.zone).toBe("sometimes");
    // Most of its light (the Plough) never goes below 5°: always, though its paws set.
    expect(c.UMa!.zone).toBe("always");
    // Most of Scorpius rises 5° high, not the end of its tail.
    expect(c.Sco).toMatchObject({ zone: "sometimes", partlyHidden: true });
    // Seen at least part of the year: the same 59 as the games' « Visibles de chez moi ».
    expect(count(c, "always") + count(c, "sometimes")).toBe(59);
    expect(count(c, "never")).toBe(29);
  });

  it("from the equator: none always up, none never seen", () => {
    const c = classify(load(), 0);
    expect([count(c, "always"), count(c, "sometimes"), count(c, "never")]).toEqual([0, 88, 0]);
  });

  it("from the north pole: nothing rises or sets, only the northern half is seen", () => {
    const figures = load();
    const c = classify(figures, 90);
    expect(count(c, "sometimes")).toBe(0);
    for (const [abbr, stars] of Object.entries(figures)) {
      const decs = stars.map((s) => (Math.asin(applyMat3(P, s.dir as Vec3)[2]) * 180) / Math.PI);
      if (decs.every((d) => d >= 5)) expect(c[abbr]!.zone, abbr).toBe("always");
      if (decs.every((d) => d < 5)) expect(c[abbr]!.zone, abbr).toBe("never");
    }
    expect(c.UMa!.zone).toBe("always");
    expect(c.Cru!.zone).toBe("never");
    const south = classify(figures, -90);
    expect(south.Cru!.zone).toBe("always");
    expect(south.UMi!.zone).toBe("never");
  });

  it("from Sydney: the Cross dips under 5° at its lowest, the Little Bear never rises", () => {
    const c = classify(load(), -33.87);
    // Acrux stays above 5°, Gacrux does not: the whole figure is up every night further south.
    expect(c.Cru).toMatchObject({ zone: "sometimes", partlyAlways: true });
    expect(classify(load(), -45).Cru!.zone).toBe("always");
    expect(c.UMi!.zone).toBe("never");
    expect(c.Ori!.zone).toBe("sometimes");
  });
});
