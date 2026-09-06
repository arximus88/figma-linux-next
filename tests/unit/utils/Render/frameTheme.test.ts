import { describe, expect, it } from "bun:test";
import { getFrameConfig, isValidFrameStyle } from "Utils/Render/frameTheme";

describe("frameTheme utils", () => {
  describe("isValidFrameStyle", () => {
    it("returns true for valid frame styles", () => {
      expect(isValidFrameStyle("windows")).toBe(true);
      expect(isValidFrameStyle("gnome")).toBe(true);
      expect(isValidFrameStyle("macos")).toBe(true);
      expect(isValidFrameStyle("kde")).toBe(true);
    });

    it("returns false for invalid frame styles", () => {
      expect(isValidFrameStyle("linux")).toBe(false);
      expect(isValidFrameStyle("")).toBe(false);
      expect(isValidFrameStyle(null)).toBe(false);
      expect(isValidFrameStyle(undefined)).toBe(false);
      expect(isValidFrameStyle(123)).toBe(false);
    });
  });

  describe("getFrameConfig", () => {
    it("returns specific configs for different styles", () => {
      const windowsConfig = getFrameConfig("windows");
      expect(windowsConfig).toBeDefined();
      expect(windowsConfig.tabs.showDividers).toBe(false);

      const gnomeConfig = getFrameConfig("gnome");
      expect(gnomeConfig).toBeDefined();
      expect(gnomeConfig.tabs.showDividers).toBe(true);

      // KDE is a real config, not the Windows placeholder it used to be.
      const kdeConfig = getFrameConfig("kde");
      expect(kdeConfig.right.close.component).not.toBe(windowsConfig.right.close.component);
      expect(kdeConfig.tabs.showDividers).toBe(false);
    });

    it("returns windows config as default for unknown style", () => {
      // Cast invalid style to expected type to test fallback
      const unknownConfig = getFrameConfig("unknown" as any);
      const windowsConfig = getFrameConfig("windows");
      expect(unknownConfig).toEqual(windowsConfig);
    });
  });
});
