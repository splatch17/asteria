import { describe, expect, it } from "vitest";
import { MIN_DIM, nightInk } from "./night";

describe("nightInk", () => {
  it("is full red at brightness 1", () => {
    expect(nightInk(1)).toBe("#ff2a1a");
  });

  it("only emits red-dominant colours and clamps to the minimum", () => {
    expect(nightInk(0)).toBe(nightInk(MIN_DIM));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(nightInk(0.4).slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g! * 5);
    expect(r).toBeGreaterThan(b! * 5);
  });
});
