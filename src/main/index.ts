import App from "./App";
import Session from "./Session";
import FontManager from "./Fonts";
import ExtensionManager from "./ExtensionManager";
import WindowManager from "./Ui/WindowManager";
import { logger } from "./Logger";
import { storage } from "./Storage";
import { dialogs } from "./Dialogs";

process.on("uncaughtException", (error: Error) => {
  logger.error(`uncaughtException: `, error);
});
process.on("unhandledRejection", (reason: Error) => {
  logger.error(`unhandledRejection: `, reason);
});

logger.initialize();
storage.initialize();
dialogs.initialize();

const session = new Session();
const fontManager = new FontManager();
const extensionManager = new ExtensionManager();
const windowManager = new WindowManager();

new App(windowManager, extensionManager, session, fontManager);
