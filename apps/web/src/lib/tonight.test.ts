import { describe, expect, it } from "vitest";
import fr from "@asteria/ui/locales/fr.json";
import { nightJump } from "./tonight";

// Local times (the test runner's time zone): only the calendar and the rounding are checked.
const local = (d: number, h: number, m: number, s = 0) => new Date(2026, 9, d, h, m, s);

describe("nightJump (#198)", () => {
  it("rounds the start of the night up to 5 minutes, so that the sky is dark", () => {
    expect(nightJump(local(24, 20, 29, 47), local(24, 14, 30)).at).toEqual(local(24, 20, 30));
    expect(nightJump(local(24, 20, 30), local(24, 14, 30)).at).toEqual(local(24, 20, 30));
  });

  it("says « ce soir » in the evening of the day shown, « cette nuit » after midnight", () => {
    expect(nightJump(local(24, 20, 29), local(24, 14, 30)).when).toBe("tonight");
    expect(nightJump(local(25, 1, 50), local(24, 14, 30)).when).toBe("night");
    // Shown early in the morning (after the night), the next one is still « ce soir ».
    expect(nightJump(local(24, 20, 29), local(24, 7, 0)).when).toBe("tonight");
  });

  it("has its texts", () => {
    const messages = fr as Record<string, string>;
    expect(messages["map.daylight.tonight"]).toContain("{time}");
    expect(messages["map.daylight.night"]).toContain("{time}");
  });
});
