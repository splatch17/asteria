import { describe, expect, it } from "vitest";
import { phoneHeading, smoothHeading } from "./device-compass";

describe("phoneHeading", () => {
  it("flat, screen up: the top of the phone", () => {
    expect(phoneHeading(0, 0, 0)).toBeCloseTo(0, 6);
    // W3C alpha grows counter-clockwise seen from above: alpha 90 → the top faces west.
    expect(phoneHeading(90, 0, 0)).toBeCloseTo(270, 6);
    expect(phoneHeading(270, 0, 0)).toBeCloseTo(90, 6);
  });
  it("held up: the back camera, same heading as flat", () => {
    expect(phoneHeading(0, 90, 0)).toBeCloseTo(0, 6);
    expect(phoneHeading(0, 45, 0)).toBeCloseTo(0, 6);
    expect(phoneHeading(270, 80, 0)).toBeCloseTo(90, 6);
  });
  it("landscape: the screen's top is the phone's side", () => {
    expect(phoneHeading(0, 0, 0, 90)).toBeCloseTo(90, 6);
  });
});

describe("smoothHeading", () => {
  it("goes the short way round through north", () => {
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(smoothHeading(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(smoothHeading(null, 123, 0.2)).toBe(123);
  });
});
