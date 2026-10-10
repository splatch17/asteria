import { describe, expect, it } from "vitest";
import { DEFAULT_SKY_LAYERS, DEFAULT_SPACE_LAYERS } from "@asteria/sky-renderer";
import {
  LAYER_SECTIONS,
  graduationFormatter,
  isLevel,
  layersFromUrl,
  restoreLayers,
  sectionsFor,
  serializeLayers,
  skyDefaults,
} from "./layers";
import fr from "@asteria/ui/locales/fr.json";

describe("restoreLayers", () => {
  it("round-trips a remembered state", () => {
    const layers = { ...DEFAULT_SKY_LAYERS, starNames: false, equatorialGrid: true };
    const stored = JSON.parse(JSON.stringify(serializeLayers(layers)));
    expect(restoreLayers(stored, DEFAULT_SKY_LAYERS)).toEqual(layers);
  });

  it("falls back to the defaults on anything but an object", () => {
    for (const bad of [null, undefined, 42, "x", true, [true, false]])
      expect(restoreLayers(bad, DEFAULT_SKY_LAYERS)).toEqual(DEFAULT_SKY_LAYERS);
  });

  it("keeps valid keys, ignores unknown keys and non-boolean values", () => {
    const restored = restoreLayers(
      { planets: false, ecliptic: "yes", milkyWay: true, azimuthalGrid: true },
      DEFAULT_SKY_LAYERS,
    );
    expect(restored).toEqual({ ...DEFAULT_SKY_LAYERS, planets: false, azimuthalGrid: true });
    expect("milkyWay" in restored).toBe(false);
  });

  it("gives missing (newer) layers their default, per view", () => {
    expect(restoreLayers({ planets: false }, DEFAULT_SPACE_LAYERS).ecliptic).toBe(true);
    expect(restoreLayers({ planets: false }, DEFAULT_SKY_LAYERS).ecliptic).toBe(false);
  });

  it("does not mutate the defaults", () => {
    restoreLayers({ planets: false }, DEFAULT_SKY_LAYERS);
    expect(DEFAULT_SKY_LAYERS.planets).toBe(true);
  });
});

describe("layersFromUrl", () => {
  it("is null without the parameter", () => {
    expect(layersFromUrl(null, DEFAULT_SKY_LAYERS)).toBeNull();
  });

  it("switches listed layers on and -key off, over the defaults", () => {
    expect(layersFromUrl("equatorialGrid,-starNames,bogus", DEFAULT_SKY_LAYERS)).toEqual({
      ...DEFAULT_SKY_LAYERS,
      equatorialGrid: true,
      starNames: false,
    });
  });
});

describe("layer catalogue", () => {
  it("covers every renderer layer exactly once", () => {
    const keys = LAYER_SECTIONS.flatMap((s) => s.entries.map((e) => e.key)).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_SKY_LAYERS).sort());
  });

  it("only offers in the Earth view the layers it renders", () => {
    const keys = sectionsFor("space").flatMap((s) => s.entries.map((e) => e.key));
    expect(keys.sort()).toEqual(["constellationLines", "ecliptic", "equatorialGrid", "planets"]);
  });

  it("has French labels for every section, entry and hint", () => {
    const messages = fr as Record<string, string>;
    for (const s of LAYER_SECTIONS) {
      expect(messages[`layers.section.${s.id}`], s.id).toBeTruthy();
      for (const e of s.entries) {
        expect(messages[`layers.${e.key}`], e.key).toBeTruthy();
        if (e.hint) expect(messages[`layers.${e.key}.hint`], e.key).toBeTruthy();
      }
    }
  });
});

describe("graduationFormatter", () => {
  // Minimal ICU stand-in: replaces {name} placeholders.
  const t = (key: string, { values }: { values: Record<string, string | number> }) =>
    (fr as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
  const format = graduationFormatter(t);

  it("prefixes each kind so that grids are told apart", () => {
    expect(format("ra", 120)).toBe("8h");
    expect(format("dec", 20)).toBe("δ +20°");
    expect(format("dec", -30)).toBe("δ −30°");
    expect(format("dec", 0)).toBe("δ 0°");
    expect(format("az", 90)).toBe("Az 90°");
    expect(format("alt", 30)).toBe("h 30°");
    expect(format("ecliptic", 120)).toBe("λ 120°");
  });
});

describe("skyDefaults", () => {
  it("shows the illustrated figures by default in Découverte only (#96)", () => {
    expect(skyDefaults("discovery").constellationFigures).toBe(true);
    expect(skyDefaults("amateur").constellationFigures).toBe(false);
    expect(skyDefaults("expert").constellationFigures).toBe(false);
    expect({ ...skyDefaults("discovery"), constellationFigures: false }).toEqual(
      DEFAULT_SKY_LAYERS,
    );
  });

  it("keeps a remembered choice over the level's default", () => {
    const discovery = skyDefaults("discovery");
    expect(restoreLayers({ constellationFigures: false }, discovery).constellationFigures).toBe(
      false,
    );
    expect(restoreLayers({ planets: true }, discovery).constellationFigures).toBe(true);
  });

  it("recognises the three levels only", () => {
    expect(["discovery", "amateur", "expert"].every(isLevel)).toBe(true);
    expect(isLevel("novice")).toBe(false);
  });
});
