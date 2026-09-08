import { describe, expect, test } from "bun:test";
import {
  APPIMAGE_DESKTOP,
  LOCAL_DESKTOP,
  buildDesktopEntry,
  planUrlHandler,
} from "../../../src/main/UrlHandlerIntegration";

const base = {
  current: "",
  execPath: "/opt/figma-linux-next/figma-linux-next",
  flatpak: false,
  dev: false,
};

describe("planUrlHandler", () => {
  test("bare binary with no handler registers a local entry", () => {
    expect(planUrlHandler(base)).toEqual({ filename: LOCAL_DESKTOP, exec: base.execPath });
  });
  test("bare binary leaves an installed package's handler alone", () => {
    expect(planUrlHandler({ ...base, current: "figma-linux-next.desktop" })).toBeNull();
  });
  test("AppImage always owns the handler", () => {
    expect(
      planUrlHandler({ ...base, appImage: "/tmp/f.AppImage", current: "figma-linux-next.desktop" }),
    ).toEqual({
      filename: APPIMAGE_DESKTOP,
      exec: "/tmp/f.AppImage",
    });
  });
  test("AppImage already registered is a no-op", () => {
    expect(
      planUrlHandler({ ...base, appImage: "/tmp/f.AppImage", current: APPIMAGE_DESKTOP }),
    ).toBeNull();
  });
  test("Flatpak and dev never write entries", () => {
    expect(planUrlHandler({ ...base, flatpak: true })).toBeNull();
    expect(planUrlHandler({ ...base, dev: true })).toBeNull();
  });
});

test("buildDesktopEntry passes the URL through and declares the scheme", () => {
  const entry = buildDesktopEntry("/x/figma-linux-next");
  expect(entry).toContain("Exec=/x/figma-linux-next %U");
  expect(entry).toContain("x-scheme-handler/figma");
});
