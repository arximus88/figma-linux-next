import { describe, expect, it } from "bun:test";

import { trayShowLabel } from "Utils/Main/tray";

describe("trayShowLabel", () => {
  it("offers to show a window while one exists", () => {
    expect(trayShowLabel(true)).toBe("Show Figma");
  });

  it("offers to open one after the last window closed", () => {
    expect(trayShowLabel(false)).toBe("Open Figma");
  });
});
