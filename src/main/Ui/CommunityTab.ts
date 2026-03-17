import { app, shell, BrowserWindow, WebContentsView, Rectangle, HandlerDetails, DidCreateWindowDetails } from "electron";

import { preloadScriptPathDev, preloadScriptPathProd, toggleDetachedDevTools } from "Utils/Main";
import {
  isDev,
  isValidProjectLink,
  isPrototypeUrl,
  isRecentFilesLink,
  isFigmaUrl,
  isValidFigjamLink,
} from "Utils/Common";
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
  public setAutosize(flag: boolean) {
    /*
    this.view.setAutoResize({
      width: false,
      height: false,
      horizontal: false,
      vertical: false,
    });
    */
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
    } as any);
    this.id = this.view.webContents.id;

    this.setAutosize(false);

    isDev && toggleDetachedDevTools(this.view.webContents);

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
  private onDomReady(_event: any) {}
  private windowOpenHandler(details: HandlerDetails) {
    const url = details.url;

    if (isPrototypeUrl(url) || isValidProjectLink(url) || isValidFigjamLink(url)) {
      app.emit("openUrlFromCommunity", url);
      return { action: "deny" };
    }

    shell.openExternal(url);

    return { action: "deny" };
  }

  private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
    const url = details.url;
    logger.debug("CommunityTab newWindow, url:", url);

    window.close();

    if (isPrototypeUrl(url) || isValidProjectLink(url) || isValidFigjamLink(url)) {
      app.emit("openUrlFromCommunity", url);
      return;
    }

    shell.openExternal(url);
  }

  private registerEvents() {
    this.view.webContents.setWindowOpenHandler(this.windowOpenHandler.bind(this));
    this.view.webContents.on("will-navigate", this.onCommunityTabWillNavigate.bind(this));
    this.view.webContents.on("dom-ready", this.onDomReady.bind(this));
    this.view.webContents.on("did-create-window", this.onNewWindow.bind(this));
  }
}
