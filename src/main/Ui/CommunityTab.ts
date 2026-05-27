import {
  app,
  shell,
  BrowserWindow,
  WebContentsView,
  Rectangle,
  HandlerDetails,
  DidCreateWindowDetails,
} from "electron";

import { preloadScriptPathDev, preloadScriptPathProd, toggleDetachedDevTools } from "Utils/Main";
import { isDev, isFigmaRunUrl, isRecentFilesLink, isFigmaUrl } from "Utils/Common";
import { storage } from "Main/Storage";
import { logger } from "Main/Logger";

export default class CommunityTab {
  public userId: string;
  public id: number;
  public view: WebContentsView;

  constructor(private windowId: number) {
    this.userId = storage.settings.userId;

    this.initTab();
    this.registerEvents();
  }

  public loadUrl(url: string) {
    this.view.webContents.loadURL(url);
  }
  public getUrl() {
    return this.view.webContents.getURL();
  }
  public setBounds(bounds: Rectangle) {
    this.view.setBounds(bounds);
  }

  private initTab() {
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        webgl: true,
        contextIsolation: false,
        zoomFactor: 1,
        preload: isDev ? preloadScriptPathDev : preloadScriptPathProd,
      },
    });
    this.id = this.view.webContents.id;

    if (isDev) toggleDetachedDevTools(this.view.webContents);

    app.emit("requestBoundsForTabView", this.windowId);
  }

  public updateScale(scale: number) {
    this.view.webContents.setZoomFactor(scale);
  }
  private onCommunityTabWillNavigate(event: Event, url: string) {
    if (isFigmaUrl(url) && !isRecentFilesLink(url)) {
      return;
    }

    event.preventDefault();

    if (isRecentFilesLink(url)) {
      app.emit("openFileBrowser");
      return;
    }

    shell.openExternal(url);
  }
  private onDomReady(_event: Electron.Event) {}
  private windowOpenHandler(details: HandlerDetails) {
    const url = details.url;

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlFromCommunity", url);
    } else {
      shell.openExternal(url);
    }

    return { action: "deny" as const };
  }

  private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
    const url = details.url;
    logger.debug("CommunityTab newWindow, url:", url);

    window.close();

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlFromCommunity", url);
      return;
    }

    shell.openExternal(url);
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).setWindowOpenHandler(this.windowOpenHandler.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("will-navigate", this.onCommunityTabWillNavigate.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("dom-ready", this.onDomReady.bind(this));
    this.view.webContents.on("did-create-window", this.onNewWindow.bind(this));
  }
}
