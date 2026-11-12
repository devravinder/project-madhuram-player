import { describe, expect, it } from "vitest";
import { shouldLockLandscape } from "./orientation";

const phone = { touch: true, shortSide: 390 };
const tablet = { touch: true, shortSide: 820 };
const computer = { touch: false, shortSide: 900 };
const wide = { width: 1920, height: 1080 };
const tall = { width: 1080, height: 1920 };

describe("shouldLockLandscape", () => {
  it("locks a wide video on a phone", () => {
    expect(shouldLockLandscape(phone, wide)).toBe(true);
  });

  it("leaves a portrait video upright on a phone", () => {
    expect(shouldLockLandscape(phone, tall)).toBe(false);
  });

  it("locks when the size is not known yet", () => {
    expect(shouldLockLandscape(phone, { width: 0, height: 0 })).toBe(true);
  });

  it("leaves tablets and computers alone", () => {
    expect(shouldLockLandscape(tablet, wide)).toBe(false);
    expect(shouldLockLandscape(computer, wide)).toBe(false);
  });

  it("leaves a small window without touch alone", () => {
    expect(shouldLockLandscape({ touch: false, shortSide: 390 }, wide)).toBe(false);
  });
});
