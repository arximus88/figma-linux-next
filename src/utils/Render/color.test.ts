import { describe, expect, test } from "bun:test";
import { isHex, isRgb, isValidColor, HexToRgb, RgbToHex } from "./color";

describe("color utils", () => {
  describe("isHex", () => {
    test("should return true for valid hex colors", () => {
      expect(isHex("#fff")).toBe(true);
      expect(isHex("#ffffff")).toBe(true);
      expect(isHex("#000000")).toBe(true);
      expect(isHex("#ABCDEF")).toBe(true);
    });

    test("should return false for invalid hex colors", () => {
      expect(isHex("fff")).toBe(false);
      expect(isHex("#ffff")).toBe(false);
      expect(isHex("#fffffff")).toBe(false);
      expect(isHex("rgb(255, 255, 255)")).toBe(false);
    });
  });

  describe("isRgb", () => {
    test("should return true for valid rgb strings", () => {
      expect(isRgb("255, 255, 255")).toBe(true);
      expect(isRgb("0, 0, 0")).toBe(true);
      expect(isRgb("255,255,255")).toBe(true);
    });

    test("should return false for invalid rgb strings", () => {
      expect(isRgb("255, 255")).toBe(false);
      expect(isRgb("#ffffff")).toBe(false);
      expect(isRgb("abc, def, ghi")).toBe(false);
    });
  });

  describe("isValidColor", () => {
    test("should return true for hex or rgb", () => {
      expect(isValidColor("#ffffff")).toBe(true);
      expect(isValidColor("255, 255, 255")).toBe(true);
    });

    test("should return false for others", () => {
      expect(isValidColor("blue")).toBe(false);
    });
  });

  describe("HexToRgb", () => {
    test("should convert 3-digit hex to rgb", () => {
      expect(HexToRgb("#fff")).toBe("rgb(255, 255, 255)");
      expect(HexToRgb("#000")).toBe("rgb(0, 0, 0)");
      expect(HexToRgb("#f0f")).toBe("rgb(255, 0, 255)");
      expect(HexToRgb("#abc")).toBe("rgb(170, 187, 204)");
    });

    test("should convert 6-digit hex to rgb", () => {
      expect(HexToRgb("#ffffff")).toBe("rgb(255, 255, 255)");
      expect(HexToRgb("#000000")).toBe("rgb(0, 0, 0)");
      expect(HexToRgb("#ff00ff")).toBe("rgb(255, 0, 255)");
    });

    test("should return original string if not hex", () => {
      expect(HexToRgb("not-a-hex")).toBe("not-a-hex");
      expect(HexToRgb("255, 255, 255")).toBe("255, 255, 255");
    });

    test("should return original string for hex strings with invalid lengths", () => {
      expect(HexToRgb("#a")).toBe("#a");
      expect(HexToRgb("#abcd")).toBe("#abcd");
      expect(HexToRgb("#abcdefg")).toBe("#abcdefg");
    });
  });

  describe("RgbToHex", () => {
    test("should convert rgb string to hex", () => {
      expect(RgbToHex("255, 255, 255")).toBe("#ffffff");
      expect(RgbToHex("0, 0, 0")).toBe("#000000");
      expect(RgbToHex("255, 0, 128")).toBe("#ff0080");
    });

    test("should handle different spacing", () => {
      expect(RgbToHex("255,255,255")).toBe("#ffffff");
      expect(RgbToHex("0,0,0")).toBe("#000000");
    });

    test("should return original string if not rgb", () => {
      expect(RgbToHex("not-a-rgb")).toBe("not-a-rgb");
      expect(RgbToHex("#ffffff")).toBe("#ffffff");
    });
  });
});
