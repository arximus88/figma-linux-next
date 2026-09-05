import { describe, expect, test } from "bun:test";
import { detectFrameStyle, resolveFrameStyle } from "./desktopEnvironment";

describe("detectFrameStyle", () => {
  const cases: Array<[string, NodeJS.ProcessEnv, Types.FrameStyle]> = [
    ["plain KDE", { XDG_CURRENT_DESKTOP: "KDE" }, "kde"],
    ["lowercase plasma session", { DESKTOP_SESSION: "plasma" }, "kde"],
    ["plasmawayland session", { DESKTOP_SESSION: "plasmawayland" }, "kde"],
    ["KDE listed second", { XDG_CURRENT_DESKTOP: "X-Generic:KDE" }, "kde"],
    ["GNOME", { XDG_CURRENT_DESKTOP: "GNOME" }, "gnome"],
    ["Ubuntu GNOME", { XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, "gnome"],
    ["Cinnamon falls back to gnome", { XDG_CURRENT_DESKTOP: "X-Cinnamon" }, "gnome"],
    ["XFCE falls back to gnome", { XDG_CURRENT_DESKTOP: "XFCE" }, "gnome"],
    ["empty env", {}, "gnome"],
    ["empty strings", { XDG_CURRENT_DESKTOP: "", DESKTOP_SESSION: "" }, "gnome"],
  ];

  for (const [name, env, expected] of cases) {
    test(name, () => {
      expect(detectFrameStyle(env)).toBe(expected);
    });
  }
});

describe("resolveFrameStyle", () => {
  test("returns the stored override when auto is off", () => {
    expect(resolveFrameStyle({ frameStyle: "windows", frameStyleAuto: false })).toBe("windows");
  });

  test("ignores the stored override when auto is on", () => {
    const detected = detectFrameStyle();
    expect(resolveFrameStyle({ frameStyle: "windows", frameStyleAuto: true })).toBe(detected);
  });
});
