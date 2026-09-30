import { describe, expect, it } from "vitest";
import fr from "./locales/fr.json";

describe("fr locale", () => {
  it("has no empty messages", () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value, key).not.toBe("");
    }
  });
});
