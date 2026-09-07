import { describe, expect, it } from "bun:test";

import { isInsideDirs, safeExportName } from "Utils/Main/safePath";

describe("isInsideDirs", () => {
  const dirs = ["/usr/share/fonts", "/home/u/.local/share/fonts"];

  it("accepts files under a font directory", () => {
    expect(isInsideDirs("/usr/share/fonts/TTF/a.ttf", dirs)).toBe(true);
    expect(isInsideDirs("/home/u/.local/share/fonts/b.otf", dirs)).toBe(true);
  });

  it("rejects escapes and lookalike prefixes", () => {
    expect(isInsideDirs("/etc/passwd", dirs)).toBe(false);
    expect(isInsideDirs("/usr/share/fonts/../../../etc/passwd", dirs)).toBe(false);
    expect(isInsideDirs("/usr/share/fonts-evil/a.ttf", dirs)).toBe(false);
  });
});

describe("safeExportName", () => {
  it("keeps plain names", () => {
    expect(safeExportName("Frame 1.png")).toBe("Frame 1.png");
  });

  it("strips directory parts", () => {
    expect(safeExportName("../../.bashrc")).toBe(".bashrc");
    expect(safeExportName("/etc/cron.d/x")).toBe("x");
    expect(safeExportName("a\\..\\b.svg")).toBe("b.svg");
  });

  it("refuses empty and dot names", () => {
    expect(safeExportName("")).toBeNull();
    expect(safeExportName("..")).toBeNull();
  });
});
