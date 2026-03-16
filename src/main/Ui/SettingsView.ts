import { app, ipcMain, WebContentsView, Rectangle, IpcMainEvent } from "electron";
import { bridgePreloadPathDev, bridgePreloadPathProd } from "Utils/Main";
import { storage } from "Main/Storage";
import { isDev } from "Utils/Common";
import { settingsUrlProd, settingsUrlDev, toggleDetachedDevTools } from "Utils/Main";
import { dialogs } from "Main/Dialogs";

export default class SettingsView {
  private enableColorSpaceSrgbWasChanged = false;
  private disableThemesChanged = false;
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
    if (this.disableThemesChanged) {
      let text = "Restart to disable themes?";
      const disableThemes = storage.settings.app.disableThemes;

      if (!disableThemes) {
        text = "Restart to enable themes?";
      }

      id = dialogs.showMessageBoxSync({
        type: "question",
        title: "Figma",
        message: text,
        detail: `Figma needs to be restarted to change use of themes.`,
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
    this.disableThemesChanged = false;
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
  private disableThemesChange(enabled: boolean) {
    const previousValue = storage.settings.app.disableThemes;

    if (enabled === previousValue) {
      return;
    }

    this.disableThemesChanged = true;
  }
  private syncThemesStart() {}
  private syncThemesEnd(themes: Themes.Theme[]) {
    this.view.webContents.send("themesLoaded", themes);
  }
  private loadCurrentTheme(theme: Themes.Theme) {
    this.view.webContents.send("loadCurrentTheme", theme);
  }

  private changeTheme(_: IpcMainEvent, theme: Themes.Theme) {
    this.loadCurrentTheme(theme);

    storage.settings.theme.currentTheme = theme.id;
  }

  private loadSettings() {
    this.view.webContents.send("loadSettings", storage.settings);
  }
  private handleFrontReady() {
    this.loadSettings();
  }

  private boundChangeTheme = this.changeTheme.bind(this);
  private boundHandleFrontReady = this.handleFrontReady.bind(this);
  private boundEnableColorSpaceSrgbChange = this.enableColorSpaceSrgbChange.bind(this);
  private boundChromiumFlagsChange = this.chromiumFlagsChange.bind(this);
  private boundDisableThemesChange = this.disableThemesChange.bind(this);
  private boundSyncThemesStart = this.syncThemesStart.bind(this);
  private boundSyncThemesEnd = this.syncThemesEnd.bind(this);
  private boundLoadCurrentTheme = this.loadCurrentTheme.bind(this);

  private registerEvents() {
    ipcMain.on("changeTheme", this.boundChangeTheme);
    ipcMain.on("frontReady", this.boundHandleFrontReady);

    app.on("enableColorSpaceSrgbWasChanged", this.boundEnableColorSpaceSrgbChange);
    app.on("chromiumFlagsChanged", this.boundChromiumFlagsChange);
    app.on("disableThemesChanged", this.boundDisableThemesChange);
    app.on("syncThemesStart", this.boundSyncThemesStart);
    app.on("syncThemesEnd", this.boundSyncThemesEnd);
    app.on("loadCurrentTheme", this.boundLoadCurrentTheme);
  }

  public destroy() {
    ipcMain.off("changeTheme", this.boundChangeTheme);
    ipcMain.off("frontReady", this.boundHandleFrontReady);

    const appEmitter = app as NodeJS.EventEmitter;
    appEmitter.off("enableColorSpaceSrgbWasChanged", this.boundEnableColorSpaceSrgbChange);
    appEmitter.off("chromiumFlagsChanged", this.boundChromiumFlagsChange);
    appEmitter.off("disableThemesChanged", this.boundDisableThemesChange);
    appEmitter.off("syncThemesStart", this.boundSyncThemesStart);
    appEmitter.off("syncThemesEnd", this.boundSyncThemesEnd);
    appEmitter.off("loadCurrentTheme", this.boundLoadCurrentTheme);

    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
