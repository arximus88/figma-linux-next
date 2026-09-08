import { describe, expect, test } from "bun:test";
import { MENU_WIDTH } from "../../../../src/constants";
import { isMenuAnchor, mainMenuPosition } from "../../../../src/utils/Main/menuPosition";

describe("mainMenuPosition", () => {
  test("right-aligns the menu under the button when an anchor is given", () => {
    expect(mainMenuPosition({ left: 1800, right: 1840, bottom: 40 }, 1920, 40)).toEqual({
      x: 1840 - MENU_WIDTH,
      y: 40,
    });
  });
  test("ignores the (possibly stale) window width when anchored", () => {
    const a = mainMenuPosition({ left: 1800, right: 1840, bottom: 40 }, 800, 40);
    const b = mainMenuPosition({ left: 1800, right: 1840, bottom: 40 }, 3000, 40);
    expect(a).toEqual(b);
  });
  test("never goes negative on a narrow panel", () => {
    expect(mainMenuPosition({ left: 0, right: 40, bottom: 40 }, 300, 40).x).toBe(0);
  });
  test("falls back to the window width without an anchor", () => {
    expect(mainMenuPosition(null, 1000, 44)).toEqual({ x: 1000 - MENU_WIDTH, y: 44 });
  });
});

describe("isMenuAnchor", () => {
  test("accepts finite rects and rejects everything else", () => {
    expect(isMenuAnchor({ left: 1, right: 2, bottom: 3 })).toBe(true);
    expect(isMenuAnchor({ left: 1, right: Number.NaN, bottom: 3 })).toBe(false);
    expect(isMenuAnchor(undefined)).toBe(false);
    expect(isMenuAnchor("x")).toBe(false);
  });
});
