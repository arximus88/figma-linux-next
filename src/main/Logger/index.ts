import log from "electron-log/main";
import { AppLogger } from "./AppLogger";

// Configure electron-log
log.initialize();
log.transports.file.level = "debug";
log.transports.console.level = "debug";
log.transports.file.fileName = "figma-linux.log";

// Initialize AppLogger with electron-log instance
export const logger = new AppLogger(log);
