import { app } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import App from "./App";
import Session from "./Session";
import FontManager from "./Fonts";
import ExtensionManager from "./ExtensionManager";
import WindowManager from "./Ui/WindowManager";
import { logger } from "./Logger";
import { storage } from "./Storage";
import { dialogs } from "./Dialogs";
import { applyChromiumSwitches } from "./applyChromiumSwitches";

// Read persisted settings synchronously, ONCE. Everything below (Ozone platform choice,
// GPU/command-line switches) must be decided BEFORE the first await / app.ready: Chromium
// reads its command line and initializes Ozone at startup and ignores anything added later
// (e.g. from inside `new App()`, which runs after `await storage.initialize()`). That
// timing bug is why GPU/shader switches never reached the engine and Skia stayed GaneshGL.
let savedSettings: { app?: Partial<Types.SettingsInterface["app"]>; mcp?: Partial<Types.SettingsInterface["mcp"]> } = {};
try {
  const settingsPath = path.join(
    process.env.HOME ?? "",
    ".config",
    "figma-linux-next",
    "settings.json",
  );
  savedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) ?? {};
} catch {
  // settings.json missing or unreadable (e.g. first run) — fall back to defaults.
}

// Figma's Skia Graphite renderer (needed for Shader/Halftone effects) only initializes
// under X11 ozone, and bringing up an XWayland window requires a CLEAN X11 environment from
// the very start of the process. Electron reads WAYLAND_DISPLAY during early native init —
// before this script runs — so stripping it from process.env here is too late: the GPU
// process is already forked with the Wayland env and the window fails ("XGetWindowAttributes
// failed for window"). The reliable fix is to relaunch ourselves once as a fresh process
// with WAYLAND_DISPLAY removed and XDG_SESSION_TYPE=x11. Guarded against infinite relaunch
// via FIGMA_FORCE_X11, and skipped under `bun run dev` (vite owns/restarts the Electron
// process there → use `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 bun run dev` instead).
if (
  savedSettings.app?.enableWebGPU &&
  process.env.WAYLAND_DISPLAY &&
  !process.env.FIGMA_FORCE_X11 &&
  process.env.NODE_ENV !== "dev"
) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_SESSION_TYPE: "x11",
    FIGMA_FORCE_X11: "1",
  };
  delete childEnv.WAYLAND_DISPLAY;
  spawn(process.execPath, process.argv.slice(1), {
    env: childEnv,
    detached: true,
    stdio: "inherit",
  }).unref();
  app.exit(0);
}

// Set the application name explicitly
app.setName("figma-linux-next");

logger.initialize();

// Apply ALL Chromium command-line switches synchronously, before the first await below.
applyChromiumSwitches(savedSettings.app ?? {});

const mcp = savedSettings.mcp ?? {};
const cdpEnabled: boolean = mcp.cdpEnabled ?? false;
const port: number = mcp.remoteDebugPort ?? 9222;
if (cdpEnabled && port > 0) {
  app.commandLine.appendSwitch("remote-debugging-port", String(port));
  // Prevent background tab throttling so CDP screenshot/trace tools
  // work on non-focused tabs without hanging.
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
}

process.on("uncaughtException", (error: Error & { code?: string }) => {
  // EPIPE means stdout/stderr pipe was closed (e.g. terminal closed while app runs).
  // Logging an EPIPE through the same broken pipe triggers another EPIPE → infinite loop.
  if (error.code === "EPIPE") return;
  logger.error(`uncaughtException: `, error);
});
process.on("unhandledRejection", (reason: Error) => {
  logger.error(`unhandledRejection: `, reason);
});

async function start() {
  await storage.initialize();
  dialogs.initialize();

  const session = new Session();
  const fontManager = new FontManager();
  new ExtensionManager();
  const windowManager = new WindowManager();

  new App(windowManager, session, fontManager);
}

start();
