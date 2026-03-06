import { describe, expect, test } from "bun:test";
import { isFigmaValidUrl } from "./url";

describe("url utils", () => {
  describe("isFigmaValidUrl", () => {
    test("should return true for valid Figma desktop app urls", () => {
      expect(isFigmaValidUrl("figma://file/abc")).toBe(true);
      expect(isFigmaValidUrl("figma://")).toBe(true);
    });

    test("should return true for valid Figma web urls", () => {
      expect(isFigmaValidUrl("https://figma.com/file/abc")).toBe(true);
      expect(isFigmaValidUrl("http://figma.com/file/abc")).toBe(true);
      expect(isFigmaValidUrl("https://www.figma.com/file/abc")).toBe(true);
      expect(isFigmaValidUrl("http://www.figma.com/file/abc")).toBe(true);
      expect(isFigmaValidUrl("https://w.figma.com/file/abc")).toBe(true);
      expect(isFigmaValidUrl("https://ww.figma.com/file/abc")).toBe(true);
    });

    test("should return false for invalid urls", () => {
      expect(isFigmaValidUrl("ftp://figma.com")).toBe(false);
      expect(isFigmaValidUrl("https://notfigma.com")).toBe(false);
      expect(isFigmaValidUrl("http://google.com")).toBe(false);
      expect(isFigmaValidUrl("figma.com")).toBe(false);
      expect(isFigmaValidUrl("file://figma.com")).toBe(false);
      expect(isFigmaValidUrl("https://wwwfigma.com")).toBe(false);
      expect(isFigmaValidUrl("https://wfigma.com")).toBe(false);
    });
  });
});
