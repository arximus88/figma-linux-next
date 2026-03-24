import { app } from "electron";
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
