import { describe, expect, test } from "bun:test";
import { devPageUrl, isFigmaValidUrl } from "Utils/Main/url";

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

  describe("devPageUrl", () => {
    // Vite moved to 5175 because another project's dev server held 5173 and
    // 5174; the hard-coded port then loaded that project's SvelteKit 404.
    test("follows the port Vite actually took", () => {
      expect(devPageUrl("index.html", "http://localhost:5175/")).toBe(
        "http://localhost:5175/index.html",
      );
      expect(devPageUrl("settings.html", "http://[::1]:5175")).toBe(
        "http://[::1]:5175/settings.html",
      );
    });

    test("every page keeps its own path", () => {
      const base = "http://localhost:5175/";
      const pages = ["index.html", "settings.html", "changelog.html", "preview.html"];
      expect(pages.map((p) => new URL(devPageUrl(p, base)).pathname)).toEqual(
        pages.map((p) => `/${p}`),
      );
    });

    test("falls back to Vite's default port outside vite dev", () => {
      expect(devPageUrl("index.html", undefined)).toBe("http://localhost:5173/index.html");
    });
  });
});
