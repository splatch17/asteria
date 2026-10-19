import { describe, expect, it } from "vitest";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { CONSTELLATION_LATIN, constellationNames } from "@asteria/content";
import { DISCOVERY_CONSTELLATIONS, FIRST_MAGNITUDE, constellationPool } from "./pool";

const ALL = Object.keys(CONSTELLATION_LATIN);

describe("constellation pools", () => {
  it("Découverte: 29 known constellations with a French name", () => {
    expect(DISCOVERY_CONSTELLATIONS).toHaveLength(29);
    const fr = constellationNames("fr");
    for (const abbr of DISCOVERY_CONSTELLATIONS) {
      expect(CONSTELLATION_LATIN[abbr], abbr).toBeDefined();
      expect(fr[abbr], abbr).toBeTruthy();
    }
  });

  it("Amateur and Expert: all 88", () => {
    expect(ALL).toHaveLength(88);
    expect(constellationPool("amateur", ALL)).toHaveLength(88);
    expect(constellationPool("expert", ALL)).toHaveLength(88);
    expect(constellationPool("discovery", ALL)).toHaveLength(29);
  });

  it("keeps only the figures the catalogue draws", () => {
    expect(constellationPool("discovery", ["Ori", "Lyr", "Ant"])).toEqual(["Lyr", "Ori"]);
  });
});

// Rule 2 checked against the synced catalogue (public/data, gitignored: skipped when absent).
// Node's fs reached without Node types (the web app's tsconfig has none).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs && fs.existsSync(data("stars.bin")) && fs.existsSync(data("star-strings.json"));

describe.skipIf(!available)("first-magnitude rule (public/data)", () => {
  it("lists exactly the constellations holding a star of V ≤ 1.5", () => {
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const strings = JSON.parse(
      new TextDecoder().decode(fs!.readFileSync(data("star-strings.json"))),
    ) as StarStrings;
    const bright = new Set(
      decodeStarCatalog(buffer, strings)
        .filter((s) => s.v <= 1.5)
        .map((s) => s.con),
    );
    expect([...bright].sort()).toEqual([...FIRST_MAGNITUDE].sort());
  });
});
