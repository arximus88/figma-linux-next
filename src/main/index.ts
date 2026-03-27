import { app } from "electron";
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

// Set the application name explicitly
app.setName("figma-linux-next");

// Apply remote-debugging-port synchronously before Chromium initializes.
// storage.initialize() is async — by the time it resolves, the browser process
// is already up and commandLine switches for CDP are ignored.
try {
  const settingsPath = path.join(
    process.env.HOME ?? "",
    ".config",
    "figma-linux-next",
    "settings.json",
  );
  const raw = fs.readFileSync(settingsPath, "utf-8");
  const mcp = JSON.parse(raw)?.mcp ?? {};
  const cdpEnabled: boolean = mcp.cdpEnabled ?? false;
  const port: number = mcp.remoteDebugPort ?? 9222;
  if (cdpEnabled && port > 0) {
    app.commandLine.appendSwitch("remote-debugging-port", String(port));
    // Prevent background tab throttling so CDP screenshot/trace tools
    // work on non-focused tabs without hanging.
    app.commandLine.appendSwitch("disable-background-timer-throttling");
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
  }
} catch {
  // settings.json missing or unreadable — skip, no debug port
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

logger.initialize();

async function start() {
  await storage.initialize();
  dialogs.initialize();

  const session = new Session();
  const fontManager = new FontManager();
  const extensionManager = new ExtensionManager();
  const windowManager = new WindowManager();

  new App(windowManager, session, fontManager);
}

start();
