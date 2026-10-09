import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deepSkyName, deepSkyNames } from "./deepsky-names";
import { CONTENT_LOCALES } from "./index";

/** Catalogue ids: "M31", "NGC5139", "IC2602", "C41", "Mel111", "ESO56-115". */
const ID = /^(M|NGC|IC|[A-Z][A-Za-z]*)\d+(-\w+)?$/;

describe.each(CONTENT_LOCALES)("deep-sky names (%s)", (locale) => {
  const names = deepSkyNames(locale);

  it("keys names by catalogue id", () => {
    expect(Object.keys(names).length).toBeGreaterThan(20);
    for (const [id, name] of Object.entries(names)) {
      expect(id).toMatch(ID);
      expect(name.trim(), id).toBe(name);
      expect(name, id).not.toBe("");
    }
  });

  it("names the landmark objects", () => {
    expect(deepSkyName(locale, "M31")).toBeTruthy();
    expect(deepSkyName(locale, "M42")).toBeTruthy();
    expect(deepSkyName(locale, "M45")).toBeTruthy();
    expect(deepSkyName(locale, "NGC9999")).toBeUndefined();
  });
});

it("uses the usual French names", () => {
  expect(deepSkyName("fr", "M31")).toBe("Galaxie d'Andromède");
  expect(deepSkyName("fr", "M42")).toBe("Nébuleuse d'Orion");
  expect(deepSkyName("fr", "M45")).toBe("Pléiades");
});

// Generated catalogue (not versioned): every key must name an object of it.
const out = fileURLToPath(new URL("../../sky-data/out/deepsky.json", import.meta.url));
it.skipIf(!existsSync(out))("only names objects of the generated catalogue", () => {
  const doc = JSON.parse(readFileSync(out, "utf-8")) as { objects: [string, ...unknown[]][] };
  const ids = new Set(doc.objects.map((row) => row[0]));
  for (const locale of CONTENT_LOCALES)
    for (const id of Object.keys(deepSkyNames(locale))) expect(ids.has(id), id).toBe(true);
});
