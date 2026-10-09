import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CREDIT_SECTIONS, creditedPackages, credits } from "./credits";
import { CONTENT_LOCALES } from "./index";

const httpsUrl = /^https:\/\/\S+$/;

/** Runtime (non-workspace) dependencies of the app and of the workspace packages it bundles. */
function runtimeDependencies(): string[] {
  const dirs = [
    "apps/web",
    "packages/astro-core",
    "packages/catalog",
    "packages/content",
    "packages/sky-renderer",
    "packages/ui",
  ];
  const deps = new Set<string>();
  for (const dir of dirs) {
    const file = new URL(`../../../${dir}/package.json`, import.meta.url);
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { dependencies?: Record<string, string> };
    for (const [name, version] of Object.entries(pkg.dependencies ?? {}))
      if (!version.startsWith("workspace:")) deps.add(name);
  }
  return [...deps].sort();
}

describe.each(CONTENT_LOCALES)("credits (%s)", (locale) => {
  const all = CREDIT_SECTIONS.flatMap((s) => credits(locale)[s]);

  it("has entries in every section", () => {
    for (const section of CREDIT_SECTIONS)
      expect(credits(locale)[section].length, section).toBeGreaterThan(0);
  });

  it("gives every entry a name, role, author, notice, licence and https links", () => {
    for (const e of all) {
      for (const field of ["id", "name", "role", "author", "notice", "license"] as const)
        expect(e[field].trim(), `${e.id}.${field}`).not.toBe("");
      expect(e.licenseUrl, `${e.id}.licenseUrl`).toMatch(httpsUrl);
      expect(e.sourceUrl, `${e.id}.sourceUrl`).toMatch(httpsUrl);
    }
  });

  it("has unique ids", () => {
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("credits every runtime dependency", () => {
    const credited = creditedPackages(locale);
    for (const dep of runtimeDependencies()) expect(credited.has(dep), dep).toBe(true);
  });

  it("keeps the attribution terms of the redistributed datasets", () => {
    const byId = new Map(all.map((e) => [e.id, e]));
    expect(byId.get("stellarium-modern")?.license).toBe("CC BY-SA 4.0");
    expect(byId.get("stories")?.license).toBe("CC BY-SA 4.0");
    expect(byId.get("stellarium-western-figures")?.license).toContain("Art Libre 1.3");
    expect(byId.get("stellarium-western-figures")?.notice).toContain("Johan Meuris");
    expect(byId.get("iau-wgsn")?.license).toBe("CC BY 4.0");
    expect(byId.get("hipparcos")?.notice).toContain("Credit: ESA");
    for (const id of ["blue-marble", "black-marble"])
      expect(byId.get(id)?.notice, id).toContain("NASA Earth Observatory");
  });
});
