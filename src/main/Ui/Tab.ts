import {
  app,
  shell,
  type Event,
  type Rectangle,
  type WebContents,
  WebContentsView,
  BrowserWindow,
  type HandlerDetails,
  type DidCreateWindowDetails,
} from "electron";

import { preloadScriptPathDev, preloadScriptPathProd } from "Utils/Main";
import {
  isDev,
  isFigmaRunUrl,
  isAppAuthRedeem,
  isFigmaDocLink,
  isFileBrowserUrl,
  isExternallyOpenableUrl,
  parseURL,
  getEditorTypeFromUrl,
} from "Utils/Common";
import { NEW_FILE_TAB_TITLE } from "Const";
import { dialogs } from "Main/Dialogs";
import { logger } from "Main/Logger";

/** Thumbnail width in device pixels: the card is 280 CSS px wide, so this stays crisp at 2×. */
const THUMBNAIL_WIDTH = 560;
const THUMBNAIL_JPEG_QUALITY = 72;

export default class Tab {
  public id: number;
  public title?: string;
  public url?: string;
  public moves?: boolean;
  public fileKey?: string;
  public isUsingMicrophone?: boolean;
  public isInVoiceCall?: boolean;
  public view: WebContentsView;
  /** Last snapshot of the page as a JPEG data URL, for the hover preview card. */
  public thumbnail?: string;

  private _editorType: Types.EditorType | undefined;
  private _isLibrary = false;

  constructor(private windowId: number) {
    this.initTab();
    this.registerEvents();
  }

  public get editorType() {
    return this._editorType;
  }
  public get isLibrary() {
    return this._isLibrary;
  }

  public setEditorType(t: Types.EditorType) {
    if (this._editorType === t) return;
    this._editorType = t;
    this.sendTabTypeToPanel();
  }
  public updateUrlAndDeriveType(newUrl: string) {
    if (this.url === newUrl) return;
    this.url = newUrl;
    const derived = getEditorTypeFromUrl(newUrl);
    if (derived) this.setEditorType(derived);
  }
  public setIsLibrary(b: boolean) {
    if (this._isLibrary === b) return;
    this._isLibrary = b;
    this.sendTabTypeToPanel();
  }

  private sendTabTypeToPanel() {
    const win = BrowserWindow.fromId(this.windowId);
    if (!win || win.isDestroyed()) return;
    win.webContents.send("setTabType", {
      id: this.id,
      editorType: this._editorType,
      isLibrary: this._isLibrary,
    });
  }

  public loadUrl(url: string) {
    this.url = url;
    const derived = getEditorTypeFromUrl(url);
    if (derived) this.setEditorType(derived);
    this.view.webContents.loadURL(url);
  }
  public getUrl() {
    return this.view.webContents.getURL();
  }

  public setBounds(bounds: Rectangle) {
    this.view.setBounds(bounds);
  }

  /**
   * Snapshot the page for the hover preview. Must be *called* while the view
   * is still visible: a hidden or detached WebContentsView has no compositor
   * surface to copy from (capturePage rejects with UnknownVizError). The call
   * queues a copy of the surface that exists right now, so Window fires it and
   * hides the view in the same tick (see Window.swapTo). Nothing waits on the
   * result — a stalled capture only means a stale thumbnail.
   */
  public async captureThumbnail(): Promise<void> {
    const wc = this.view.webContents;
    if (wc.isDestroyed()) return;
    try {
      const image = await wc.capturePage();
      if (image.isEmpty()) {
        logger.debug(`[Tab ${this.id}] thumbnail capture returned an empty image`);
        return;
      }
      const { width } = image.getSize();
      const thumb = width > THUMBNAIL_WIDTH ? image.resize({ width: THUMBNAIL_WIDTH }) : image;
      this.thumbnail = `data:image/jpeg;base64,${thumb.toJPEG(THUMBNAIL_JPEG_QUALITY).toString("base64")}`;
    } catch (error) {
      // Window hidden/minimised mid-switch, view already gone — keep the previous thumbnail.
      logger.debug(`[Tab ${this.id}] thumbnail capture skipped:`, error);
    }
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
  private onDomReady(_event: Event) {}
  private onDidNavigateInPage(_event: Event, newUrl: string, isMainFrame: boolean) {
    if (!isMainFrame) return;
    // Figma performs SPA navigations via history.pushState which bypass
    // will-navigate. If a non-MainTab tab ends up at a /files/ URL (the home
    // file browser), route it to MainTab — those URLs belong on MainTab,
    // and rendering them inside a design-file Tab leaves the page stuck in
    // a skeleton state.
    if (isFileBrowserUrl(newUrl)) {
      app.emit("openUrlInNewTab", newUrl);
    }
  }
  private onMainWindowWillNavigate(event: Event & { sender?: WebContents }, newUrl: string) {
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

    const from = parseURL(currentUrl);
    const to = parseURL(newUrl);

    if (from?.pathname === "/login") {
      event.preventDefault();
      return;
    }

    if (to?.pathname === "/logout") {
      app.emit("signOut");
    }

    if (to?.search?.match(/[?&]redirected=1/)) {
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

    if (isExternallyOpenableUrl(url)) {
      shell.openExternal(url);
    }
  }

  private permissionHandler(
    _webContents: WebContents,
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

    logger.debug(
      `[Tab ${this.id}] window.open url="${url}" frameName="${details.frameName}" disposition="${details.disposition}" features="${details.features}"`,
    );

    if (isFigmaRunUrl(url)) {
      app.emit("openUrlInNewTab", url);
      return { action: "deny" as const };
    }

    if (isExternallyOpenableUrl(url)) {
      shell.openExternal(url);
    } else {
      logger.warn(`[Tab ${this.id}] window.open blocked, unsupported scheme: ${url}`);
    }

    return { action: "deny" as const };
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).setWindowOpenHandler(this.windowOpenHandler.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("will-navigate", this.onMainWindowWillNavigate.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("did-navigate-in-page", this.onDidNavigateInPage.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents as any).on("dom-ready", this.onDomReady.bind(this));
    this.view.webContents.on("did-create-window", this.onNewWindow.bind(this));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.view.webContents.session as any).setPermissionRequestHandler(
      this.permissionHandler.bind(this),
    );
  }
}
