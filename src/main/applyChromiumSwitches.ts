import { app } from "electron";

import { logger } from "./Logger";

// Vulkan switches — both trigger Vulkan usage and are incompatible with ozone=wayland.
const VULKAN_SWITCHES = ["use-vulkan", "enable-unsafe-webgpu", "enable-skia-graphite"];

/**
 * Decide whether the process must relaunch itself under a clean X11 environment.
 *
 * Figma's WebGPU shader effects only composite under X11 ozone, and Electron reads
 * WAYLAND_DISPLAY during early native init — too early to strip in JS — so a Wayland session
 * with shaders enabled must spawn a fresh child with WAYLAND_DISPLAY removed (see index.ts).
 * Pure + env-injectable so the decision is unit-testable without spawning anything.
 *
 * Guards: FIGMA_FORCE_X11 prevents an infinite relaunch loop; dev is skipped (vite owns the
 * Electron process); test is skipped (Playwright drives the launched process directly, so
 * spawning a detached copy + app.exit(0) would orphan it and hang every e2e test).
 */
export function shouldRelaunchUnderX11(
  settings: Partial<Types.SettingsInterface["app"]>,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    settings?.enableWebGPU &&
      env.WAYLAND_DISPLAY &&
      !env.FIGMA_FORCE_X11 &&
      env.NODE_ENV !== "dev" &&
      env.NODE_ENV !== "test",
  );
}

/**
 * Apply every Chromium command-line switch.
 *
 * CRITICAL: this MUST run synchronously at process startup, BEFORE the first `await`
 * (i.e. before `app.ready`). Chromium reads the command line once when the GPU/browser
 * process launches on ready; ANY `appendSwitch` after that point is silently ignored —
 * the code path still runs and logs, but the flags never reach the engine. This bit GPU
 * switches hard: they used to be applied inside `new App()` which runs after
 * `await storage.initialize()`, so Skia stayed `GaneshGL`, Wayland/VAAPI flags never took
 * effect, and Figma's WebGPU shader effects (which need Skia Graphite) couldn't render.
 * That is why the same flags work in a standalone probe but not in the app. The caller in
 * `index.ts` reads settings.json synchronously (via fs) and invokes this before `start()`.
 */
export function applyChromiumSwitches(settings: Partial<Types.SettingsInterface["app"]> = {}) {
  // Chromium flags for better performance and GPU support
  // Full flags reference: https://peter.sh/experiments/chromium-command-line-switches/

  const switches = settings.commandSwitches;

  // Detect session type before applying defaults so we can make informed decisions
  const isWayland = process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY;

  // "value": "false" / "0" is a UI convention for "disabled" — skip those entirely.
  // Chromium boolean flags have no =false form; you either pass them or you don't.
  const effectiveSwitches = (switches ?? []).filter((s) => s.value !== "false" && s.value !== "0");

  // User explicitly opts into Vulkan only if a vulkan switch is present and not disabled.
  const userForcesVulkan = effectiveSwitches.some((s) => VULKAN_SWITCHES.includes(s.switch));

  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- hoisted helper, kept below for readability
  applyDefaultOptimizations(isWayland, userForcesVulkan, !!settings.enableWebGPU);

  if (effectiveSwitches.length) {
    for (const item of effectiveSwitches) {
      // Skip Vulkan switches on Wayland unless user explicitly forced them above.
      if (isWayland && !userForcesVulkan && VULKAN_SWITCHES.includes(item.switch)) {
        logger.info(`Wayland: skipping user switch --${item.switch}`);
        continue;
      }
      app.commandLine.appendSwitch(item.switch, item.value);
    }
  }

  if (settings.enableColorSpaceSrgb) {
    app.commandLine.appendSwitch("force-color-profile", "srgb");
  } else {
    app.commandLine.appendSwitch("disable-color-correct-rendering");
  }
}

function applyDefaultOptimizations(
  isWayland: boolean,
  userForcesVulkan: boolean,
  enableShaders: boolean,
) {
  // Figma's Shader / Halftone / Noise effects need WebGPU output to composite onto the
  // canvas. Chromium's WebGPU↔GL interop (webgpu_on_vk_via_gl_interop) does exactly that,
  // and it is available under X11 ozone but DISABLED under Wayland ozone (crbug 442791440 /
  // 475935650 — the entry is Wayland-specific). So we just run the app under X11/XWayland:
  // the effects then render through the lightweight GaneshGL compositor + interop. We do
  // NOT enable Skia Graphite — Graphite (GraphiteDawnVulkan) also renders the effects but
  // adds noticeable canvas-pan latency; GaneshGL + interop is the faster path.
  //
  // X11 must be set from a CLEAN X11 environment at process start (Electron reads
  // WAYLAND_DISPLAY during early native init) — index.ts relaunches Wayland sessions with a
  // stripped env first (non-dev). In dev the env can't be relaunched (vite owns the process),
  // so use the env prefix. If the toggle is on but we're still on Wayland, run normally
  // without shaders rather than force ozone=x11 (which would break window creation).
  const shadersActive = enableShaders && !isWayland;
  if (shadersActive) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  } else if (enableShaders) {
    logger.info(
      "WebGPU shaders requested but session is Wayland — running without them (a production build relaunches under XWayland automatically; in dev use `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 bun run dev`)",
    );
  }

  // On X11: bypass the GPU blocklist so hardware acceleration isn't blocked for
  // capable GPUs. On Wayland: leave the blocklist active — it disables Vulkan for
  // known-incompatible combos (AMD + ozone=wayland), preventing the Dawn/Vulkan
  // surface factory conflict and the associated log spam.
  if (!isWayland) {
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
  }
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");

  // Collect all features to enable
  const features = [
    "VaapiVideoDecoder",
    "VaapiVideoEncoder",
    "CanvasOopRasterization",
    "WebRTCPipeWireCapturer",
    "UseSkiaRenderer",
  ];

  // Wayland support detection and enablement
  if (isWayland) {
    logger.info("Wayland session detected - enabling native Wayland support");
    app.commandLine.appendSwitch("ozone-platform-hint", "auto");
    features.push("WaylandWindowDecorations", "UseOzonePlatform");
  } else {
    if (shadersActive) {
      logger.info(
        "WebGPU shaders enabled — running under XWayland (ozone=x11); effects composite via WebGPU↔GL interop on GaneshGL",
      );
    }
    // DirectRenderingDisplayCompositor moves the display compositor onto the GPU
    // process thread, reducing frame-delivery latency. X11-only — incompatible
    // with Wayland's own compositor scheduling.
    features.push("DirectRenderingDisplayCompositor");
  }

  // Enable modern rendering features
  app.commandLine.appendSwitch("enable-features", features.join(","));

  // WebGPU/Vulkan: gated on the enableWebGPU toggle, not merely on the session type.
  // enable-unsafe-webgpu exposes navigator.gpu, which is what Figma probes to switch on
  // its Shader/Halftone/Noise effects — so it belongs with the shaders, behind the toggle.
  // Previously this fired on any X11 session (!isWayland), which left WebGPU silently ON
  // for X11 users who had the toggle OFF, contradicting the setting. Now it follows
  // shadersActive (X11 + enableWebGPU); on Wayland the blocklist disables Vulkan anyway.
  // The escape hatch stays: a user can force it via commandSwitches (userForcesVulkan),
  // which also re-enables it on Wayland with a warning. Note this only gates WebGPU — the
  // normal WebGL canvas keeps its hardware acceleration (ignore-gpu-blocklist + enable-webgl
  // on X11 are untouched), so a toggle-off X11 user simply loses the shader effects, not
  // general GPU rendering.
  if (shadersActive || userForcesVulkan) {
    if (userForcesVulkan && isWayland) {
      logger.warn(
        "enable-unsafe-webgpu forced on Wayland via commandSwitches — Vulkan may conflict with the compositor",
      );
    }
    app.commandLine.appendSwitch("enable-unsafe-webgpu");
  }

  // WebGL optimizations for Figma's canvas engine
  app.commandLine.appendSwitch("enable-webgl");
  app.commandLine.appendSwitch("enable-webgl2-compute-context");
  app.commandLine.appendSwitch("enable-accelerated-2d-canvas");

  // Disable smooth scrolling to let Figma handle it
  app.commandLine.appendSwitch("disable-smooth-scrolling");

  // Performance optimizations
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");

  logger.info(
    `Applied default performance optimizations for Linux (session: ${isWayland ? "Wayland" : "X11"}${
      shadersActive ? ", XWayland forced for shaders" : ""
    })`,
  );
}
