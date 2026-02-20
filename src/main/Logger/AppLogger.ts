import { LogFunctions } from "electron-log";

export class AppLogger {
  constructor(private logInstance: LogFunctions) {}

  public initialize = (): void => {
    try {
      const { ipcMain } = require("electron");
      if (!ipcMain) {
        console.warn("AppLogger: Electron ipcMain is not available yet.");
        return;
      }

      ipcMain.on("logDebug", (sender: any, ...msg: any[]) =>
        this.debug(`[From web content: ${sender.sender.id}]`, ...msg),
      );
      ipcMain.on("logInfo", (sender: any, ...msg: any[]) =>
        this.info(`[From web content: ${sender.sender.id}]`, ...msg),
      );
      ipcMain.on("logWarn", (sender: any, ...msg: any[]) =>
        this.warn(`[From web content: ${sender.sender.id}]`, ...msg),
      );
      ipcMain.on("logError", (sender: any, ...msg: any[]) =>
        this.error(`[From web content: ${sender.sender.id}]`, ...msg),
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
