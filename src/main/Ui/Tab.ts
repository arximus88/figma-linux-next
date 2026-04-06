import { parse } from "url";
import {
  app,
  shell,
  Rectangle,
  WebContents,
  WebContentsView,
  BrowserWindow,
  HandlerDetails,
  DidCreateWindowDetails,
  WebContentsViewConstructorOptions,
} from "electron";

import { preloadScriptPathDev, preloadScriptPathProd } from "Utils/Main";
import {
  isDev,
  isFigmaUrl,
  isFigmaRunUrl,
  isPrototypeUrl,
  isAppAuthRedeem,
  isFigmaDocLink,
} from "Utils/Common";
import { NEW_FILE_TAB_TITLE } from "Const";
import { dialogs } from "Main/Dialogs";
import { logger } from "Main/Logger";

export default class Tab {
  public id: number;
  public title?: string;
  public url?: string;
  public moves?: boolean;
  public fileKey?: string;
  public isUsingMicrophone?: boolean;
  public isInVoiceCall?: boolean;
  public view: WebContentsView;

  constructor(private windowId: number) {
    this.initTab();
    this.registerEvents();
  }

  public loadUrl(url: string) {
    this.url = url;
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

    app.emit("requestBoundsForTabView", this.windowId);
  }

  public updateScale(scale: number) {
    this.view.webContents.setZoomFactor(scale);
  }
  private onDomReady(_event: any) {}
  private onMainWindowWillNavigate(event: any, newUrl: string) {
    if (!event.sender || event.sender.isDestroyed()) return;
    const currentUrl = event.sender.getURL();

    if (isAppAuthRedeem(newUrl)) {
      return;
    }

    if (newUrl === currentUrl) {
      event.preventDefault();
      return;
    }

    if (this.title === NEW_FILE_TAB_TITLE && isFigmaRunUrl(newUrl)) {
      app.emit("openUrlInNewTab", newUrl);
      event.preventDefault();
      return;
    }

    if (isFigmaDocLink(newUrl)) {
      shell.openExternal(newUrl);

      event.preventDefault();
      return;
    }

    const from = parse(currentUrl);
    const to = parse(newUrl);

    if (from.pathname === "/login") {
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
  private onNewWindow(window: BrowserWindow, details: DidCreateWindowDetails) {
    const url = details.url;
    logger.debug("newWindow, url: ", url);

    if (/start_google_sso/.test(url)) return;

    window.close();

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlInNewTab", url);
      return;
    }

    shell.openExternal(url);
  }

  private permissionHandler(
    webContents: WebContents,
    permission:
      | "clipboard-read"
      | "clipboard-sanitized-write"
      | "display-capture"
      | "fullscreen"
      | "geolocation"
      | "idle-detection"
      | "media"
      | "mediaKeySystem"
      | "midi"
      | "midiSysex"
      | "notifications"
      | "pointerLock"
      | "openExternal"
      | "window-management"
      | "unknown",
    callback: (permissionGranted: boolean) => void,
  ) {
    const allowByDefault = [
      "fullscreen",
      "pointerLock",
      "clipboard-read",
      "clipboard-write",
      "clipboard-sanitized-write",
    ];

    if (allowByDefault.includes(permission)) {
      return callback(true);
    }

    if (permission === "media") {
      if (this.isUsingMicrophone) {
        return callback(true);
      }

      const id = dialogs.showMessageBoxSync({
        type: "question",
        title: "Figma",
        message: "Microphone access required for voice call.",
        detail: `Allow microphone access?`,
        textOkButton: "Allow",
        textCancelButton: "Deny",
        defaultFocusedButton: "Ok",
      });

      if (id === 0) {
        this.isUsingMicrophone = true;

        return callback(true);
      }
    }

    return callback(false);
  }

  private windowOpenHandler(details: HandlerDetails) {
    const { url } = details;

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlInNewTab", url);
    } else {
      shell.openExternal(url);
    }

    return { action: "deny" as const };
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).setWindowOpenHandler(this.windowOpenHandler.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("will-navigate", this.onMainWindowWillNavigate.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("dom-ready", this.onDomReady.bind(this));
    this.view.webContents.on("did-create-window", this.onNewWindow.bind(this));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents.session as any).setPermissionRequestHandler(
      this.permissionHandler.bind(this),
    );
  }
}
