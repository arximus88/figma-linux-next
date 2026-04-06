import { describe, expect, it } from "bun:test";
import { ALLOW_CODE_FILES, ALLOW_EXT_FILES, ALLOW_UI_FILES } from "Utils/Common/extensions";

describe("extensions utils", () => {
  describe("ALLOW_EXT_FILES", () => {
    it("matches allowed extensions (.html, .js, .ts)", () => {
      expect(ALLOW_EXT_FILES.test("index.html")).toBe(true);
      expect(ALLOW_EXT_FILES.test("script.js")).toBe(true);
      expect(ALLOW_EXT_FILES.test("main.ts")).toBe(true);
      expect(ALLOW_EXT_FILES.test("path/to/file.ts")).toBe(true);
    });

    it("matches manifest.json exactly", () => {
      expect(ALLOW_EXT_FILES.test("manifest.json")).toBe(true);
      expect(ALLOW_EXT_FILES.test("path/to/manifest.json")).toBe(false); // only exact matches because regex is ^(...manifest.json)$
    });

    it("does not match other extensions", () => {
      expect(ALLOW_EXT_FILES.test("style.css")).toBe(false);
      expect(ALLOW_EXT_FILES.test("image.png")).toBe(false);
      expect(ALLOW_EXT_FILES.test("data.json")).toBe(false);
      expect(ALLOW_EXT_FILES.test("script.jsx")).toBe(false);
    });

    it("does not match uppercase extensions without lowercase match", () => {
      expect(ALLOW_EXT_FILES.test("script.JS")).toBe(false);
    });

    it("handles no extension", () => {
      expect(ALLOW_EXT_FILES.test("script")).toBe(false);
    });

    it("handles double extensions", () => {
      expect(ALLOW_EXT_FILES.test("script.min.js")).toBe(true);
      expect(ALLOW_EXT_FILES.test("script.js.map")).toBe(false);
    });
  });

  describe("ALLOW_CODE_FILES", () => {
    it("matches allowed extensions (.js, .ts)", () => {
      expect(ALLOW_CODE_FILES.test("script.js")).toBe(true);
      expect(ALLOW_CODE_FILES.test("main.ts")).toBe(true);
    });

    it("does not match other extensions", () => {
      expect(ALLOW_CODE_FILES.test("index.html")).toBe(false);
      expect(ALLOW_CODE_FILES.test("style.css")).toBe(false);
    });
  });

  describe("ALLOW_UI_FILES", () => {
    it("matches allowed extensions (.html)", () => {
      expect(ALLOW_UI_FILES.test("index.html")).toBe(true);
      expect(ALLOW_UI_FILES.test("path/to/ui.html")).toBe(true);
    });

    it("does not match other extensions", () => {
      expect(ALLOW_UI_FILES.test("script.js")).toBe(false);
      expect(ALLOW_UI_FILES.test("main.ts")).toBe(false);
    });
  });
});
