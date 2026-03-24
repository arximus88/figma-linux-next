import { parse } from "url";
import {
  app,
  shell,
  WebContentsView,
  WebContentsViewConstructorOptions,
  Rectangle,
  BrowserWindow,
  DidCreateWindowDetails,
  Event,
  HandlerDetails,
} from "electron";

import { LOGIN_PAGE, RECENT_FILES } from "Const";
import {
  preloadMainScriptPathDev,
  preloadMainScriptPathProd,
  toggleDetachedDevTools,
} from "Utils/Main";
import {
  isDev,
  isFigmaRunUrl,
  isFileBrowserUrl,
  isValidProjectLink,
  isPrototypeUrl,
  isAppAuthRedeem,
  isFigmaDocLink,
  isFigmaBoardLink,
  isFigmaDesignLink,
} from "Utils/Common";
import { storage } from "Main/Storage";
import { logger } from "Main/Logger";

export default class MainTab {
  private _userId: string;
  private options: WebContentsViewConstructorOptions = {
    webPreferences: {
      nodeIntegration: false,
      webgl: true,
      contextIsolation: false,
      zoomFactor: 1,
      preload: isDev ? preloadMainScriptPathDev : preloadMainScriptPathProd,
    },
  };

  public id: number;
  public view: WebContentsView;

  constructor(private windowId: number) {
    this.initTab();
    this.registerEvents();
  }

  public setUserId(id: string) {
    if (this._userId !== id) {
      const url = `${RECENT_FILES}/?fuid=${id}`;
      this.loadUrl(url);
    }

    this._userId = id;
  }
  public loadUrl(url: string) {
    this.view.webContents.loadURL(url);
  }
  public getUrl() {
    return this.view.webContents.getURL();
  }
  public loadLoginPage() {
    this.view.webContents.loadURL(LOGIN_PAGE);
  }
  public redeemAppAuth(secret: string) {
    this.view.webContents.send("redeemAppAuth", secret);
  }
  public handleUrl(path: string) {
    this.view.webContents.send("handleUrl", path);
  }
  public setBounds(bounds: Rectangle) {
    this.view.setBounds(bounds);
  }

  private initTab() {
    this._userId = storage.settings.userId;
    const url = `${RECENT_FILES}/?fuid=${this._userId}`;

    this.view = new WebContentsView(this.options);
    this.id = this.view.webContents.id;

    this.loadUrl(url);

    isDev && toggleDetachedDevTools(this.view.webContents);

    app.emit("requestBoundsForTabView", this.windowId);
  }

  public updateScale(scale: number) {
    this.view.webContents.setZoomFactor(scale);
  }
  private onMainTabWillNavigate(event: Event<any>, url: string) {
    if (isFigmaRunUrl(url) && !isFileBrowserUrl(url)) {
      app.emit("openUrlInNewTab", url);

      event.preventDefault();
    }
  }
  private onDomReady(_event: any) {}
  private onMainWindowWillNavigate(event: Event<any>, url: string) {
    if (event?.sender) {
      const currentUrl = event.sender.getURL();
      if (isAppAuthRedeem(url)) {
        return;
      }

      if (url === currentUrl) {
        event.preventDefault();
        return;
      }

      const from = parse(currentUrl);
      const to = parse(url);

      if (from.pathname === "/login") {
        // this.tabManager.reloadAll();

        event.preventDefault();
        return;
      }

      if (to.pathname === "/logout") {
        app.emit("signOut");
      }

      if (to.search && to.search.match(/[\?\&]redirected=1/)) {
        event.preventDefault();
        return;
      }
    }

    if (isFigmaDocLink(url)) {
      shell.openExternal(url);
      event.preventDefault();
      return;
    }
    if (isFigmaBoardLink(url) || isFigmaDesignLink(url)) {
      app.emit("openUrlInNewTab", url);
      event.preventDefault();
      return;
    }
  }
  private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
    const { url } = details;
    logger.debug("newWindow, url: ", url);

    if (/start_google_sso/.test(url)) return;

    if (isFileBrowserUrl(url)) {
      window.close();
      this.view.webContents.loadURL(url);
      return;
    }

    if (isFigmaRunUrl(url)) {
      if (isFigmaBoardLink(url) || isFigmaDesignLink(url)) {
        window.destroy();
      }
      app.emit("openUrlInNewTab", url);
      return;
    }

    shell.openExternal(url);
  }

  private windowOpenHandler(details: HandlerDetails) {
    const { url } = details;

    if (isFileBrowserUrl(url)) {
      // Team/project/recent browsing — navigate within the main tab, not a new tab
      this.view.webContents.loadURL(url);
      return { action: "deny" as const };
    }

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlInNewTab", url);
      return { action: "deny" as const };
    } else {
      return { action: "allow" as const };
    }
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).setWindowOpenHandler(this.windowOpenHandler.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("will-navigate", this.onMainTabWillNavigate.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("will-navigate", this.onMainWindowWillNavigate.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("dom-ready", this.onDomReady.bind(this));
    this.view.webContents.on("did-create-window", this.onNewWindow.bind(this));
  }
}
