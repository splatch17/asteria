import { describe, expect, it } from "vitest";
import { CONSTELLATION_LATIN, CONTENT_LOCALES, constellationNames } from "./index";

describe("constellation names", () => {
  it("covers the 88 IAU constellations", () => {
    expect(Object.keys(CONSTELLATION_LATIN)).toHaveLength(88);
  });

  it.each(CONTENT_LOCALES)("has a %s name for every constellation", (locale) => {
    const names = constellationNames(locale);
    for (const abbr of Object.keys(CONSTELLATION_LATIN)) expect(names[abbr], abbr).toBeTruthy();
  });
});
