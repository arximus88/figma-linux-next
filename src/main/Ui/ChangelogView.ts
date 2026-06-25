import { WebContentsView, type Rectangle } from "electron";

import {
  bridgePreloadPathDev,
  bridgePreloadPathProd,
  changelogUrlDev,
  changelogUrlProd,
  toggleDetachedDevTools,
} from "Utils/Main";
import { isDev } from "Utils/Common";

export default class ChangelogView {
  public view: WebContentsView;

  constructor() {
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: isDev ? bridgePreloadPathDev : bridgePreloadPathProd,
        experimentalFeatures: false,
      },
    });
    this.view.setBackgroundColor("#00000000");

    this.view.webContents.loadURL(isDev ? changelogUrlDev : changelogUrlProd);
  }

  public closeDevTools() {
    if (this.view.webContents.isDevToolsOpened()) {
      this.view.webContents.closeDevTools();
    }
  }

  public toggleDevTools() {
    toggleDetachedDevTools(this.view.webContents);
  }

  public updateProps(bounds: Rectangle) {
    this.view.setBounds({
      height: bounds.height,
      width: bounds.width,
      y: 0,
      x: 0,
    });
  }

  public destroy() {
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.destroy();
    }
  }
}
