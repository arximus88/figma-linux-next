import type { LogFunctions } from "electron-log";
import { ipcRegistry } from "../controllers/registry";

export class AppLogger {
  constructor(private logInstance: LogFunctions) {}

  public initialize = (): void => {
    try {
      ipcRegistry.on(
        "logDebug",
        (sender: any, ...msg: any[]) =>
          this.debug(`[From web content: ${sender.sender.id}]`, ...msg),
        "AppLogger",
      );
      ipcRegistry.on(
        "logInfo",
        (sender: any, ...msg: any[]) =>
          this.info(`[From web content: ${sender.sender.id}]`, ...msg),
        "AppLogger",
      );
      ipcRegistry.on(
        "logWarn",
        (sender: any, ...msg: any[]) =>
          this.warn(`[From web content: ${sender.sender.id}]`, ...msg),
        "AppLogger",
      );
      ipcRegistry.on(
        "logError",
        (sender: any, ...msg: any[]) =>
          this.error(`[From web content: ${sender.sender.id}]`, ...msg),
        "AppLogger",
      );
    } catch (e) {
      console.error("AppLogger: Failed to initialize IPC handlers", e);
    }
  };

  public debug = (...params: any[]) => this.logInstance.debug(...params);
  public info = (...params: any[]) => this.logInstance.info(...params);
  public warn = (...params: any[]) => this.logInstance.warn(...params);
  public error = (...params: any[]) => this.logInstance.error(...params);
  public log = (...params: any[]) => this.logInstance.log(...params);
}
