import { describe, expect, it } from "bun:test";
import {
  getFrameConfig,
  getFrameStyleVars,
  getFrameStyleName,
  isValidFrameStyle,
  getAvailableFrameStyles,
  FRAME_STYLES,
} from "Utils/Render/frameTheme";

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
    });

    it("returns windows config as default for unknown style", () => {
      // Cast invalid style to expected type to test fallback
      const unknownConfig = getFrameConfig("unknown" as any);
      const windowsConfig = getFrameConfig("windows");
      expect(unknownConfig).toEqual(windowsConfig);
    });
  });

  describe("getFrameStyleVars", () => {
    it("returns CSS variables string for valid styles", () => {
      const windowsVars = getFrameStyleVars("windows");
      expect(windowsVars).toContain("--panel-height: ");
      expect(windowsVars).toContain("--panel-bg: ");

      const gnomeVars = getFrameStyleVars("gnome");
      expect(gnomeVars).toContain("--panel-height: ");
    });

    it("returns gnome style vars as fallback for unknown style", () => {
      const unknownVars = getFrameStyleVars("unknown" as any);
      const gnomeVars = getFrameStyleVars("gnome");
      expect(unknownVars).toEqual(gnomeVars);
    });
  });

  describe("getFrameStyleName", () => {
    it("returns correct display names for valid styles", () => {
      expect(getFrameStyleName("windows")).toBe("Windows 11");
      expect(getFrameStyleName("gnome")).toBe("GNOME / Adwaita");
    });

    it("returns 'Unknown' for styles without display names", () => {
      expect(getFrameStyleName("macos")).toBe("Unknown");
      expect(getFrameStyleName("kde")).toBe("Unknown");
      expect(getFrameStyleName("invalid" as any)).toBe("Unknown");
    });
  });

  describe("getAvailableFrameStyles", () => {
    it("returns array of available styles", () => {
      const styles = getAvailableFrameStyles();
      expect(styles.length).toBeGreaterThan(0);
      expect(styles).toContainEqual({ value: "windows", label: "Windows 11" });
      expect(styles).toContainEqual({ value: "gnome", label: "GNOME / Adwaita" });
    });
  });
});
