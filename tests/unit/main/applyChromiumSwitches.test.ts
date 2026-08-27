import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Self-contained electron mock (other test files override the global preload's electron mock,
// so this test records switches into a local array bound to its own app.commandLine).
const recorded: Array<{ name: string; value?: string }> = [];

mock.module("electron", () => ({
  app: {
    commandLine: {
      appendSwitch: (name: string, value?: string) => {
        recorded.push({ name, value });
      },
      appendArgument: (arg: string) => {
        recorded.push({ name: arg });
      },
    },
  },
}));

// Let the real Logger load against a no-op electron-log (full transports shape so its
// top-level configuration in Main/Logger doesn't throw).
mock.module("electron-log/main", () => ({
  default: {
    initialize: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    transports: {
      file: { level: "debug", resolvePathFn: undefined },
      console: { level: "debug" },
    },
  },
}));

import { applyChromiumSwitches, shouldRelaunchUnderX11 } from "Main/applyChromiumSwitches";

const has = (name: string) => recorded.some((s) => s.name === name);
const switchValue = (name: string) => recorded.find((s) => s.name === name)?.value;
const features = (): string[] => {
  const f = recorded.find((s) => s.name === "enable-features");
  return f?.value ? f.value.split(",") : [];
};

// applyChromiumSwitches reads process.env for session detection, so each case sets/clears
// WAYLAND_DISPLAY / XDG_SESSION_TYPE and we restore the real values afterwards.
const ENV_KEYS = ["WAYLAND_DISPLAY", "XDG_SESSION_TYPE"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  recorded.length = 0;
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("applyChromiumSwitches — Wayland vs X11 truth-table", () => {
  test("X11, shaders off: blocklist bypass + DirectRenderingDisplayCompositor, WebGPU stays OFF", () => {
    applyChromiumSwitches({});

    expect(has("ignore-gpu-blocklist")).toBe(true);
    // WebGPU is gated on the enableWebGPU toggle, not the session type: toggle off → no unsafe-webgpu.
    expect(has("enable-unsafe-webgpu")).toBe(false);
    // …but general GPU acceleration for the normal WebGL canvas is unaffected.
    expect(has("enable-webgl")).toBe(true);
    expect(features()).toContain("DirectRenderingDisplayCompositor");
    expect(features()).not.toContain("WaylandWindowDecorations");
    expect(has("ozone-platform")).toBe(false);
    // colorspace defaults off → disable-color-correct-rendering
    expect(has("disable-color-correct-rendering")).toBe(true);
    expect(has("force-color-profile")).toBe(false);
  });

  test("X11 + enableWebGPU: forces ozone-platform=x11 and enables unsafe-webgpu for shaders", () => {
    applyChromiumSwitches({ enableWebGPU: true });

    expect(switchValue("ozone-platform")).toBe("x11");
    expect(has("enable-unsafe-webgpu")).toBe(true);
    expect(has("ignore-gpu-blocklist")).toBe(true);
    expect(features()).toContain("DirectRenderingDisplayCompositor");
  });

  test("Wayland, shaders off: ozone-hint=auto, Wayland features, no blocklist bypass, no vulkan", () => {
    process.env.WAYLAND_DISPLAY = "wayland-0";

    applyChromiumSwitches({});

    expect(switchValue("ozone-platform-hint")).toBe("auto");
    expect(features()).toContain("WaylandWindowDecorations");
    expect(features()).toContain("UseOzonePlatform");
    expect(features()).not.toContain("DirectRenderingDisplayCompositor");
    expect(has("ignore-gpu-blocklist")).toBe(false);
    expect(has("enable-unsafe-webgpu")).toBe(false);
    expect(has("ozone-platform")).toBe(false);
  });

  test("Wayland + enableWebGPU: does NOT force ozone=x11 (shaders inactive on Wayland)", () => {
    process.env.WAYLAND_DISPLAY = "wayland-0";

    applyChromiumSwitches({ enableWebGPU: true });

    expect(has("ozone-platform")).toBe(false);
    // Shaders are inactive on a live Wayland session (production relaunches under XWayland
    // before this runs), so unsafe-webgpu stays off here too.
    expect(has("enable-unsafe-webgpu")).toBe(false);
    expect(features()).toContain("WaylandWindowDecorations");
  });

  test("Wayland + user-forced vulkan switch: applies enable-unsafe-webgpu despite Wayland", () => {
    process.env.WAYLAND_DISPLAY = "wayland-0";

    applyChromiumSwitches({ commandSwitches: [{ switch: "enable-unsafe-webgpu" }] });

    expect(has("enable-unsafe-webgpu")).toBe(true);
  });

  test("XDG_SESSION_TYPE=wayland alone (no WAYLAND_DISPLAY) is treated as Wayland", () => {
    process.env.XDG_SESSION_TYPE = "wayland";

    applyChromiumSwitches({});

    expect(features()).toContain("WaylandWindowDecorations");
    expect(has("ignore-gpu-blocklist")).toBe(false);
  });

  test("colorspace sRGB on: force-color-profile=srgb instead of disable-color-correct-rendering", () => {
    applyChromiumSwitches({ enableColorSpaceSrgb: true });

    expect(switchValue("force-color-profile")).toBe("srgb");
    expect(has("disable-color-correct-rendering")).toBe(false);
  });

  test("disabled command switch (value:'false') is filtered out; enabled one is applied", () => {
    applyChromiumSwitches({ commandSwitches: [{ switch: "some-flag", value: "false" }] });
    expect(has("some-flag")).toBe(false);

    recorded.length = 0;
    applyChromiumSwitches({ commandSwitches: [{ switch: "some-flag" }] });
    expect(has("some-flag")).toBe(true);
  });
});

describe("shouldRelaunchUnderX11", () => {
  const webgpu = { enableWebGPU: true };

  test("enableWebGPU off → never relaunch", () => {
    expect(
      shouldRelaunchUnderX11({}, { WAYLAND_DISPLAY: "wayland-0", NODE_ENV: "production" }),
    ).toBe(false);
  });

  test("WebGPU + Wayland + production → relaunch", () => {
    expect(
      shouldRelaunchUnderX11(webgpu, { WAYLAND_DISPLAY: "wayland-0", NODE_ENV: "production" }),
    ).toBe(true);
  });

  test("FIGMA_FORCE_X11 set → no relaunch (infinite-loop guard)", () => {
    expect(
      shouldRelaunchUnderX11(webgpu, {
        WAYLAND_DISPLAY: "wayland-0",
        FIGMA_FORCE_X11: "1",
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  test("NODE_ENV=dev → no relaunch", () => {
    expect(shouldRelaunchUnderX11(webgpu, { WAYLAND_DISPLAY: "wayland-0", NODE_ENV: "dev" })).toBe(
      false,
    );
  });

  test("NODE_ENV=test → no relaunch (regression: orphaned Playwright process)", () => {
    expect(shouldRelaunchUnderX11(webgpu, { WAYLAND_DISPLAY: "wayland-0", NODE_ENV: "test" })).toBe(
      false,
    );
  });

  test("no WAYLAND_DISPLAY (X11 session) → no relaunch", () => {
    expect(shouldRelaunchUnderX11(webgpu, { NODE_ENV: "production" })).toBe(false);
  });

  test("FLATPAK_ID set → no relaunch (regression: zypak spawn interception segfaults)", () => {
    expect(
      shouldRelaunchUnderX11(webgpu, {
        WAYLAND_DISPLAY: "wayland-0",
        NODE_ENV: "production",
        FLATPAK_ID: "app.borys.FigmaLinuxNext",
      }),
    ).toBe(false);
  });
});
