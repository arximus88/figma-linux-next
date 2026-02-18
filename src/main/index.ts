import App from "./App";
import Session from "./Session";
import FontManager from "./Fonts";
import ExtensionManager from "./ExtensionManager";
import WindowManager from "./Ui/WindowManager";
import { logger } from "./Logger";

process.on("uncaughtException", (error: Error) => {
  logger.error(`uncaughtException: `, error);
});
process.on("unhandledRejection", (reason: Error) => {
  logger.error(`unhandledRejection: `, reason);
});

new App(new WindowManager(), new ExtensionManager(), new Session(), new FontManager());
