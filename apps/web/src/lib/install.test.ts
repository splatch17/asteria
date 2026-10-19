import { describe, expect, it } from "vitest";
import { isIos, isStandalone } from "./install";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const S23 =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

describe("isIos", () => {
  it("recognises the iPhone, and the iPad behind its Mac user agent", () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD, 5)).toBe(true);
  });
  it("leaves a Mac without touch screen and Android out", () => {
    expect(isIos(IPAD, 0)).toBe(false);
    expect(isIos(S23, 5)).toBe(false);
  });
});

describe("isStandalone", () => {
  it("is true from the display mode or from iOS navigator.standalone", () => {
    expect(isStandalone(true)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(false)).toBe(false);
  });
});
