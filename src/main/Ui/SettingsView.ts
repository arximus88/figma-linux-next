import { app, ipcMain, WebContentsView, Rectangle } from "electron";
import { bridgePreloadPathDev, bridgePreloadPathProd } from "Utils/Main";
import { storage } from "Main/Storage";
import { isDev } from "Utils/Common";
import { settingsUrlProd, settingsUrlDev, toggleDetachedDevTools } from "Utils/Main";
import { dialogs } from "Main/Dialogs";

export default class SettingsView {
  private enableColorSpaceSrgbWasChanged = false;
  private chromiumFlagsChanged = false;

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
    } as any);
    this.view.setBackgroundColor("#00000000");

    /*
    this.view.setAutoResize({
      width: false,
      height: false,
      horizontal: false,
      vertical: false,
    });
    */

    this.view.webContents.loadURL(isDev ? settingsUrlDev : settingsUrlProd);

    this.registerEvents();
  }

  public closeDevTools() {
    if (this.view.webContents.isDevToolsOpened()) {
      this.view.webContents.closeDevTools();
    }
  }

  public postClose() {
    let id = 1;
    if (this.enableColorSpaceSrgbWasChanged) {
      id = dialogs.showMessageBoxSync({
        type: "question",
        title: "Figma",
        message: "Restart to Change Color Space?",
        detail: `Figma needs to be restarted to change the color space.`,
        textOkButton: "Restart",
        defaultFocusedButton: "Ok",
      });
    }
    if (this.chromiumFlagsChanged) {
      id = dialogs.showMessageBoxSync({
        type: "question",
        title: "Figma",
        message: "Restart to apply Chromium flags?",
        detail: `Figma needs to be restarted to apply Chromium flags.`,
        textOkButton: "Restart",
        defaultFocusedButton: "Ok",
      });
    }
    if (!id) {
      app.emit("relaunchApp");
    }
  }

  public updateProps(bounds: Rectangle) {
    this.enableColorSpaceSrgbWasChanged = false;
    this.chromiumFlagsChanged = false;
    this.view.setBounds({
      height: bounds.height,
      width: bounds.width,
      y: 0,
      x: 0,
    });
  }

  private enableColorSpaceSrgbChange(enabled: boolean) {
    const previousValue = storage.settings.app.enableColorSpaceSrgb;

    if (enabled === previousValue) {
      return;
    }

    this.enableColorSpaceSrgbWasChanged = true;
  }
  private chromiumFlagsChange(enabled: boolean) {
    this.chromiumFlagsChanged = enabled;
  }

  private loadSettings() {
    this.view.webContents.send("loadSettings", storage.settings);
  }
  private handleFrontReady() {
    this.loadSettings();
  }

  private boundHandleFrontReady = this.handleFrontReady.bind(this);
  private boundEnableColorSpaceSrgbChange = this.enableColorSpaceSrgbChange.bind(this);
  private boundChromiumFlagsChange = this.chromiumFlagsChange.bind(this);

  private registerEvents() {
    ipcMain.on("frontReady", this.boundHandleFrontReady);

    app.on("enableColorSpaceSrgbWasChanged", this.boundEnableColorSpaceSrgbChange);
    app.on("chromiumFlagsChanged", this.boundChromiumFlagsChange);
  }

  public destroy() {
    ipcMain.off("frontReady", this.boundHandleFrontReady);

    const appEmitter = app as NodeJS.EventEmitter;
    appEmitter.off("enableColorSpaceSrgbWasChanged", this.boundEnableColorSpaceSrgbChange);
    appEmitter.off("chromiumFlagsChanged", this.boundChromiumFlagsChange);

    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
