import { ipcMain, WebContentsView, type Rectangle } from "electron";
import { bridgePreloadPathDev, bridgePreloadPathProd } from "Utils/Main";
import { storage } from "Main/Storage";
import { isDev } from "Utils/Common";
import { settingsUrlProd, settingsUrlDev } from "Utils/Main";

export default class SettingsView {
  public view: WebContentsView;

  constructor() {
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: isDev ? bridgePreloadPathDev : bridgePreloadPathProd,
        experimentalFeatures: false,
        webviewTag: true,
      },
    });
    this.view.setBackgroundColor("#00000000");

    this.view.webContents.loadURL(isDev ? settingsUrlDev : settingsUrlProd);

    this.registerEvents();
  }

  public closeDevTools() {
    if (this.view.webContents.isDevToolsOpened()) {
      this.view.webContents.closeDevTools();
    }
  }

  public updateProps(bounds: Rectangle) {
    this.view.setBounds({
      height: bounds.height,
      width: bounds.width,
      y: 0,
      x: 0,
    });
  }

  private loadSettings() {
    this.view.webContents.send("loadSettings", storage.settings);
  }
  private handleFrontReady() {
    this.loadSettings();
  }

  private boundHandleFrontReady = this.handleFrontReady.bind(this);

  private registerEvents() {
    ipcMain.on("frontReady", this.boundHandleFrontReady);
  }

  public destroy() {
    ipcMain.off("frontReady", this.boundHandleFrontReady);

    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
