import { parse } from "url";
import { app, BrowserWindow, IpcMainEvent, Rectangle, Menu } from "electron";
import { storage } from "Main/Storage";
import SettingsView from "./SettingsView";
import TabManager from "./TabManager";
import { logger } from "../Logger";

import { HOMEPAGE, TOPPANELHEIGHT, NEW_PROJECT_TAB_URL, NEW_FILE_TAB_TITLE } from "Const";
import { WINDOW_DEFAULT_OPTIONS } from "Const/window";
import {
  isDev,
  isCommunityUrl,
  isAppAuthRedeem,
  isFileBrowserUrl,
  normalizeUrl,
  parseURL,
  getTabDedupKey,
} from "Utils/Common";
import { panelUrlDev, panelUrlProd, toggleDetachedDevTools } from "Utils/Main";
import Tab from "./Tab";

export default class Window {
  private window: BrowserWindow;
  private tabManager: TabManager;
  private settingsView: SettingsView;
  private state: Types.WindowState;

  private _userId: string;
  private settingsViewOpen = false;

  // Warm tab: a pre-loaded "new file" tab kept in background for instant opening.
  private warmTab: Tab | null = null;
  private warmTabCreatedAt = 0;
  private warmTabScheduled = false;
  private static readonly WARM_TAB_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(state: Types.WindowState) {
    this.window = new BrowserWindow({
      ...WINDOW_DEFAULT_OPTIONS,
      ...state,
      webPreferences: {
        ...WINDOW_DEFAULT_OPTIONS.webPreferences,
        ...(state as any).webPreferences,
      },
    });
    this.tabManager = new TabManager(this.window.id);
    this.settingsView = new SettingsView();
    this.state = state;

    this.window.contentView.addChildView(this.tabManager.mainTab.view);
    this.updateTabsBounds();

    this.registerEvents();

    this.window.loadURL(isDev ? panelUrlDev : panelUrlProd);
    isDev && toggleDetachedDevTools(this.window.webContents);
    this.applyState();
  }

  public get id() {
    return this.window.id;
  }
  public get webContentId() {
    return this.window.webContents.id;
  }
  public get settingsViewId() {
    return this.settingsView.view.webContents.id;
  }
  public get mainTabInfo() {
    return {
      id: this.tabManager.mainTab.id,
      url: this.tabManager.mainTab.view.webContents.getURL(),
    };
  }
  public get communityTabInfo() {
    return {
      id: this.tabManager.communityTab ? this.tabManager.communityTab.id : -1,
      url: this.tabManager.communityTab
        ? this.tabManager.communityTab.view.webContents.getURL()
        : "",
    };
  }
  public get tabs() {
    return this.tabManager.getAll();
  }
  public get win() {
    return this.window;
  }
  public get allWebContentsIds() {
    const ids = new Set<number>([
      this.webContentId,
      this.settingsViewId,
      this.tabManager.mainTabWebContentId,
      ...this.tabs.keys(),
    ]);

    if (this.tabManager.communityTabWebContentId) {
      ids.add(this.tabManager.communityTabWebContentId);
    }
    // Include warm tab so IPC messages from it can be routed to this window
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      ids.add(this.warmTab.id);
    }

    return [...ids];
  }

  public setUserId(id: string) {
    this._userId = id;
    this.tabManager.setUserId(id);
    // Start warming the new-file tab in background once we have a userId.
    // Guard with warmTabScheduled to prevent cascade: the warm tab itself
    // loads Figma which sends setUser again, which would re-trigger this.
    if (!this.warmTab && !this.warmTabScheduled) {
      this.scheduleWarmTab(2000);
    }
  }
  public sortTabs(tabs: Types.TabFront[]) {
    this.tabManager.sortTabs(tabs);
  }
  public getState(): Types.WindowState & { windowId: number } {
    const tabs: Types.SavedTab[] = [];

    for (const [_, tab] of this.tabs) {
      tabs.push({
        title: tab.title,
        url: tab.url,
      });
    }

    const bounds = this.window.getBounds();

    return {
      ...bounds,
      isMaximized: this.window.isMaximized(),
      lastActiveTabPath: this.tabManager.getActiveTabPath(),
      hasOpenedCommunityTab: this.tabManager.hasOpenedCommunityTab,
      windowId: this.id,
      userId: this._userId,
      tabs,
    };
  }
  public restoreTabs(list?: Types.SavedTab[]) {
    const tabs =
      list ??
      (
        storage.settings.app.lastOpenedTabs as {
          [key: string]: Types.SavedTab[];
        }
      )[this.id];

    if (!tabs) {
      return;
    }

    setTimeout(() => {
      tabs.forEach((tab, i) => {
        setTimeout(() => {
          this.addTab(tab.url, tab.title);
          if (i + 1 === tabs.length) {
            this.setTabFocusByPath(this.state.lastActiveTabPath);
          }
        }, 300 * i);
      });
    }, 100);
  }
  public calcBoundsForTabView(): Rectangle {
    const panelHeight = storage.settings.app.panelHeight || TOPPANELHEIGHT;
    const contentBounds = this.window.getContentBounds();

    return {
      x: 0,
      y: panelHeight,
      width: contentBounds.width || 1200,
      height: (contentBounds.height || 900) - panelHeight,
    };
  }

  public handleUrl(path: string) {
    this.tabManager.handleUrl(path);
    this.setFocusToMainTab();
  }
  public handlePluginManageAction(type: string) {
    this.tabManager.mainTab.view.webContents.send("handlePluginMenuAction", { type });
    this.setFocusToMainTab();
  }
  public handlePluginMenuAction(pluginMenuAction: Menu.MenuAction) {
    this.tabManager.handlePluginMenuAction(pluginMenuAction);
  }
  public toggleDevTools() {
    toggleDetachedDevTools(this.window.webContents);
  }
  public toggleSettingsDevTools() {
    toggleDetachedDevTools(this.settingsView.view.webContents);
  }
  public toggleCurrentTabDevTools() {
    const tab = this.tabManager.getById(this.tabManager.lastFocusedTab);

    if (tab) {
      toggleDetachedDevTools(tab.view.webContents);
    }
  }

  /** Find an already-open tab matching this URL's dedup key. Prototype and editor
   *  URLs for the same file have different dedup keys and therefore coexist. */
  private findTabForUrl(url: string): Tab | undefined {
    const key = getTabDedupKey(url);
    if (!key) return undefined;
    for (const tab of this.tabManager.getAll().values()) {
      const storedKey = tab.url ? getTabDedupKey(tab.url) : null;
      const liveKey = getTabDedupKey(tab.getUrl());
      if (storedKey === key || liveKey === key) return tab;
    }
    return undefined;
  }

  public openUrlFromCommunity(url: string) {
    const existing = this.findTabForUrl(url);
    if (existing) {
      this.setTabFocus(existing.id);
      return;
    }
    const tab = this.addTab(url);
    if (!tab) return;

    this.setTabFocus(tab.id);
  }

  public openUrl(url: string) {
    if (isFileBrowserUrl(url)) {
      this.tabManager.loadUrlInMainTab(url);
      this.setFocusToMainTab();
      return;
    }
    if (isAppAuthRedeem(url)) {
      const normalizedUrl = normalizeUrl(url);

      this.tabManager.loadUrlInMainTab(normalizedUrl);
    } else if (isCommunityUrl(url)) {
      this.handleUrl(parse(url).path);
      this.setFocusToMainTab();
    } else if (/figma:\/\//.test(url)) {
      const httpUrl = url.replace(/figma:\//, HOMEPAGE);
      const existing = this.findTabForUrl(httpUrl);
      if (existing) {
        this.setTabFocus(existing.id);
        return;
      }
      const tab = this.addTab(httpUrl);
      if (tab) this.setTabFocus(tab.id);
    } else if (/https?:\/\//.test(url)) {
      const existing = this.findTabForUrl(url);
      if (existing) {
        this.setTabFocus(existing.id);
        return;
      }
      const tab = this.addTab(url);
      if (tab) this.setTabFocus(tab.id);
    }
  }
  public focus() {
    this.window.focus();
  }
  public showHandler(event: IpcMainEvent) {
    const scale = storage.settings.ui.scalePanel;

    this.updatePanelScale(event, scale);
  }

  public updatePanelScale(_: IpcMainEvent, scale: number) {
    const panelScale = +scale.toFixed(2);

    storage.settings.app.panelHeight = Math.floor(TOPPANELHEIGHT * panelScale);
    storage.settings.ui.scalePanel = panelScale;

    this.window.webContents.send("setPanelScale", panelScale, storage.settings.app.panelHeight);

    this.updateTabsBounds();
  }
  public updateFigmaUiScale(_: IpcMainEvent, scale: number) {
    this.tabManager.updateScaleAll(scale);
  }

  public setFrameStyle(style: Types.FrameStyle) {
    this.window.webContents.send("frameStyleChanged", style);
  }

  public getBounds() {
    return this.window.getBounds();
  }
  public updateTabsBounds() {
    const bounds = this.calcBoundsForTabView();
    this.tabManager.setBoundsForActiveTab(bounds);
    if (this.settingsViewOpen) {
      this.settingsView.updateProps(this.window.getBounds());
    }
  }

  public updateAllTabsBounds() {
    const bounds = this.calcBoundsForTabView();
    this.tabManager.setBoundsForAllTab(bounds);
    if (this.settingsViewOpen) {
      this.settingsView.updateProps(this.window.getBounds());
    }
  }
  public closeAllTab(_: IpcMainEvent) {
    const tabs = this.tabManager.getAll();

    for (const [_, tab] of tabs) {
      this.window.contentView.removeChildView(tab.view);
    }

    this.tabManager.closeAll();

    this.window.webContents.send("closeAllTab");
  }
  public loadLoginPageAllWindows() {
    this.tabManager.loadLoginPage();
  }
  public redeemAppAuth(secret: string) {
    this.tabManager.redeemAppAuth(secret);
  }

  public newProject() {
    if (this.tabManager.hasOpenedNewFileTab) {
      return;
    }

    const warm = this.warmTab;
    if (warm && !warm.view.webContents.isDestroyed()) {
      // Promote the pre-warmed tab — instant, no loading delay
      this.warmTab = null;
      this.tabManager.promoteWarmTab(warm);
      this.window.webContents.send("didTabAdd", {
        id: warm.id,
        url: warm.url,
        title: NEW_FILE_TAB_TITLE,
      });
      this.setTabFocus(warm.id);
      // Warm the next one for next time
      this.scheduleWarmTab(100);
    } else {
      // Fallback: warm tab not ready yet, create normally
      this.addTab(`${NEW_PROJECT_TAB_URL}?fuid=${this._userId}`, NEW_FILE_TAB_TITLE);
    }

    this.window.webContents.send("newFileBtnVisible", false);
  }
  public createFile(args: WebApi.CreateFile) {
    const newFileTab = this.tabManager.getByTitle(NEW_FILE_TAB_TITLE);
    const tab = this.addTab(args.url);
    if (!tab) return false;

    tab.loadUrl(args.url);
    this.closeTab(newFileTab.id);
    this.tabWasClosed(newFileTab.id);

    this.window.webContents.send("newFileBtnVisible", true);

    this.setTabFocus(tab.id);

    return true;
  }
  public openMainMenuCloseHandler() {
    setTimeout(() => {
      this.window.webContents.send("isMainMenuOpen", false);
    }, 150);
  }
  public hasWebContentId(webContentsId: number) {
    return this.tabManager.getAll().has(webContentsId);
  }

  public getTabInfo(tabId: number) {
    const tab = this.tabManager.getById(tabId);
    if (!tab) {
      return {
        id: tabId,
        title: "",
        url: "",
      };
    }

    const url = tab.getUrl();

    return {
      id: tabId,
      title: tab instanceof Tab ? tab.title : "",
      url,
    };
  }

  public addTab(url: string, title?: string) {
    const parsedUrl = parseURL(url);
    if (!parsedUrl) {
      logger.warn(`addTab: invalid URL "${url}", skipping`);
      return null;
    }
    parsedUrl.searchParams.set("fuid", this._userId);

    const tab = this.tabManager.addTab(parsedUrl.toString(), title);
    tab.view.setBackgroundColor(this.figmaThemeBgColor);

    this.window.webContents.send("didTabAdd", {
      id: tab.id,
      url,
      title,
    });

    return tab;
  }

  public openSettingsView() {
    this.settingsViewOpen = true;
    const bounds = this.window.getBounds();
    this.settingsView.updateProps(bounds);

    this.window.contentView.addChildView(this.settingsView.view);

    isDev && toggleDetachedDevTools(this.settingsView.view.webContents);

    setTimeout(() => {
      this.settingsView.updateProps(bounds);
    }, 100);
  }
  public closeSettingsView() {
    if (!this.settingsView.view) {
      return;
    }

    this.settingsViewOpen = false;
    this.settingsView.closeDevTools();

    this.window.contentView.removeChildView(this.settingsView.view);

    this.settingsView.postClose();
  }
  public toggleFullScreen() {
    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    } else {
      this.window.setFullScreen(true);
    }
  }
  private onEnterFullScreen() {
    const tab = this.tabManager.getById(this.tabManager.lastFocusedTab);

    if (tab) {
      tab.view.webContents.send("handleSetFullScreen", true);
    }
  }
  private onLeaveFullScreen() {
    const tab = this.tabManager.getById(this.tabManager.lastFocusedTab);

    if (tab) {
      tab.view.webContents.send("handleSetFullScreen", false);
    }
  }
  private applyState() {
    const { x, y, height, width, userId, tabs, isMaximized } = this.state;
    userId && this.setUserId(userId);

    if (storage.settings.app.saveLastOpenedTabs && tabs && tabs.length > 0) {
      this.window.webContents.once("did-finish-load", () => this.restoreTabs(tabs));
    }

    this.win.setBounds({ x, y, width, height });

    if (isMaximized) {
      this.win.maximize();
    }
  }

  public setLoading(event: IpcMainEvent, args: WebApi.SetLoading) {
    const tabId = event.sender.id;
    const tab = this.tabManager.getById(tabId);

    if (!tab) {
      return;
    }

    this.window.webContents.send("setLoading", tabId, args.loading);
  }
  public windowMinimize(event: IpcMainEvent) {
    this.window.minimize();
  }
  public windowMaximize(event: IpcMainEvent) {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    if (this.window.isMaximized()) {
      this.window.restore();
      event.reply("windowDidRestored");
    } else {
      this.window.maximize();
      event.reply("windowDidMaximized");
    }
  }
  private webContentDidFinishLoad() {
    if (this.state.hasOpenedCommunityTab) {
      this.openCommunity({
        path: "/@figma_linux",
        userId: this._userId,
      });
    }

    this.setFocusToMainTab();
  }
  public setMenu(menu: Menu) {
    this.window.setMenu(menu);
  }
  public closeNewFileTab() {
    const newFileTab = this.tabManager.getByTitle(NEW_FILE_TAB_TITLE);

    if (!newFileTab) {
      return;
    }

    this.closeTab(newFileTab.id);
    this.tabWasClosed(newFileTab.id);
    this.window.webContents.send("newFileBtnVisible", true);
  }

  public setIsInVoiceCall(tabId: number, isInVoiceCall: boolean) {
    this.window.webContents.send("setIsInVoiceCall", { id: tabId, isInVoiceCall });
  }
  public setUsingMicrophone(tabId: number, isUsingMicrophone: boolean) {
    this.window.webContents.send("setUsingMicrophone", { id: tabId, isUsingMicrophone });
  }
  public reload() {
    this.window.reload();
  }
  public reloadTab(tabId: number) {
    this.tabManager.reloadTab(tabId);
  }
  public closeTab(tabId: number) {
    // Guard: reject IDs that are not in the active tab list.
    // TabManager.getById() falls back to mainTab for unknown IDs, which would
    // cause mainTab to be removed from contentView on double-close (e.g. when
    // renderer sends closeTab after setFocusToMainTab already closed it internally).
    if (!this.tabManager.getAll().has(tabId)) {
      return;
    }

    const tab = this.tabManager.getById(tabId);

    if (!tab) {
      return;
    }

    const isNewFileTab = this.tabManager.isNewFileTab(tabId);

    this.window.contentView.removeChildView(tab.view);

    const nextTabId = this.tabManager.close(tabId);

    if (this.tabManager.lastFocusedTab === tabId) {
      if (isNewFileTab) {
        this.tabManager.hasOpenedCommunityTab
          ? this.setFocusToCommunityTab()
          : this.setFocusToMainTab();
      } else {
        this.tabManager.focusTab(nextTabId);
        this.window.webContents.send("focusTab", nextTabId);

        switch (nextTabId) {
          case "mainTab": {
            this.setFocusToMainTab();
            break;
          }
          case "communityTab": {
            this.setFocusToCommunityTab();
            break;
          }
          default: {
            this.setTabFocus(nextTabId);
          }
        }
      }
    }

    if (!this.tabManager.hasOpenedNewFileTab) {
      this.window.webContents.send("newFileBtnVisible", true);
    }
  }
  public getLatestFocusedTabId() {
    return this.tabManager.lastFocusedTab;
  }

  /** Execute arbitrary JS from within the active Figma WebContentsView context. */
  public executeInBrowserView(script: string): Promise<any> {
    const tab = this.tabManager.getById(this.tabManager.lastFocusedTab);
    if (!tab) return Promise.resolve(undefined);
    return tab.view.webContents.executeJavaScript(script);
  }

  /** Execute a fetch from within the active Figma WebContentsView context.
   *  Uses relative paths on www.figma.com so session cookies are sent automatically.
   *  @param path - relative path, e.g. "/api/files/{key}/nodes?ids=..." */
  public figmaApiFetch(path: string): Promise<any> {
    return this.executeInBrowserView(`
      fetch(${JSON.stringify(path)})
        .then(r => r.ok ? r.json() : r.text().then(t => ({ error: r.status + ": " + t })))
        .catch(e => ({ error: e.message }))
    `);
  }
  public tabWasClosed(tabId: number) {
    this.window.webContents.send("tabWasClosed", tabId);
  }
  public setFocusToMainTab() {
    const mainTab = this.tabManager.mainTab;

    this.detachLastFocusedTab();
    this.window.contentView.addChildView(mainTab.view);
    this.tabManager.focusMainTab();
    this.closeNewFileTab();
    this.window.webContents.send("focusTab", "mainTab");

    app.emit("needUpdateMenu", this.id, null, { "close-tab": false });
  }
  public setFocusToCommunityTab() {
    const bounds = this.calcBoundsForTabView();
    const communityTab = this.tabManager.communityTab;

    this.detachLastFocusedTab();
    this.window.contentView.addChildView(communityTab.view);
    this.tabManager.focusCommunityTab();
    this.closeNewFileTab();
    this.tabManager.communityTab.setBounds(bounds);
    this.window.webContents.send("focusTab", "communityTab");

    app.emit("needUpdateMenu", this.id, null, { "close-tab": true });
  }
  public setTabFocusByPath(path: string) {
    const tab = this.tabManager.getByPath(path);

    if (tab) {
      this.setTabFocus(tab.id);
    } else {
      if (/recents/.test(path)) {
        this.setFocusToMainTab();
        this.tabManager.loadUrlInMainTab(`${HOMEPAGE}${path}`);
      }
      if (/community/.test(path)) {
        this.setFocusToCommunityTab();
        this.tabManager.loadUrlInCommunityTab(`${HOMEPAGE}${path}`);
      }
    }
  }
  public loadUrlMainTab(url: string) {
    this.tabManager.mainTab.loadUrl(url);
  }
  public setTabFocus(tabId: number) {
    const tab = this.tabManager.getById(tabId);
    if (!tab) return;

    const bounds = this.calcBoundsForTabView();

    this.detachLastFocusedTab();
    this.window.contentView.addChildView(tab.view);

    this.tabManager.focusTab(tabId);
    this.tabManager.setBounds(tabId, bounds);
    this.window.webContents.send("focusTab", tabId);

    app.emit("needUpdateMenu", this.id, tabId, { "close-tab": true });
  }
  public focusNextTab() {
    const nextId = this.tabManager.getNextTabId(this.tabManager.lastFocusedTab);
    if (nextId !== undefined) this.setTabFocus(nextId);
  }
  public focusPrevTab() {
    const prevId = this.tabManager.getPrevTabId(this.tabManager.lastFocusedTab);
    if (prevId !== undefined) this.setTabFocus(prevId);
  }
  public setTabTitle(event: IpcMainEvent, title: string) {
    // Ignore title updates from the warm tab (not yet promoted to active tab)
    if (this.warmTab && event.sender.id === this.warmTab.id) return;

    const tab = this.tabManager.getById(event.sender.id);

    if (!tab || (tab instanceof Tab && tab.title === NEW_FILE_TAB_TITLE)) {
      return;
    }

    this.tabManager.setTitle(tab.id, title);
    if (tab && tab.view && tab.view.webContents) {
      this.window.webContents.send("setTitle", { id: tab.view.webContents.id, title });
    }
  }
  public openFile(event: IpcMainEvent, ...args: string[]) {
    let url = `${HOMEPAGE}${args[0]}`;

    if (args[2]) {
      url = `${url}${args[2]}`;
    }

    const openedFromNewFileTab = this.tabManager.isNewFileTab(event?.sender?.id);

    if (event?.sender?.id === this.tabManager.mainTabWebContentId && isFileBrowserUrl(url)) {
      this.loadUrlMainTab(url);
      this.setFocusToMainTab();
      return;
    }

    const existing = this.findTabForUrl(url);
    if (existing) {
      this.closeNewFileTab();
      this.setTabFocus(existing.id);
      return;
    }

    const tab = this.addTab(url);
    if (tab) {
      this.closeNewFileTab();
      this.setTabFocus(tab.id);
    }
  }
  public closeCommunityTab() {
    this.window.contentView.removeChildView(this.tabManager.communityTab.view);
    this.tabManager.closeCommunityTab();
    this.setFocusToMainTab();

    this.tabManager.hasOpenedCommunityTab = false;
    this.window.webContents.send("communityTabWasClose");
  }
  public openCommunity(args: WebApi.OpenCommunity) {
    const alreadyOpen = this.tabManager.hasOpenedCommunityTab;
    const bounds = this.calcBoundsForTabView();
    const url = `${HOMEPAGE}${args.path}?fuid=${args.userId}`;

    if (!alreadyOpen) {
      this.tabManager.addCommunityTab();
      this.tabManager.communityTab.userId = args.userId;
      this.tabManager.communityTab.loadUrl(url);
      this.window.contentView.addChildView(this.tabManager.communityTab.view);
    }

    this.window.contentView.addChildView(this.tabManager.communityTab.view);
    this.tabManager.communityTab.setBounds(bounds);

    this.window.webContents.send("openCommunity");
    this.tabManager.hasOpenedCommunityTab = true;

    this.setFocusToCommunityTab();
  }
  public updateVisibleNewProjectBtn(_: IpcMainEvent, visible: boolean) {
    this.window.webContents.send("updateVisibleNewProjectBtn", visible);
  }
  public handleCallbackForTab(webContentsId: number, cbId: number, args: any) {
    this.tabManager.handleCallbackForTab(webContentsId, cbId, args);
  }

  public handleFrontReady() {
    this.window.webContents.send("loadSettings", storage.settings);
    this.showHandler(null);
  }

  public close() {
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      this.warmTab.view.webContents.destroy();
    }
    this.warmTab = null;
    this.settingsView.destroy();
    this.tabManager.closeAll();
    this.window.close();
  }

  private get figmaThemeBgColor(): string {
    return storage.settings.app.figmaTheme === "light" ? "#ffffff" : "#1e1e1e";
  }

  private scheduleWarmTab(delayMs: number) {
    if (this.warmTabScheduled) return;
    this.warmTabScheduled = true;
    setTimeout(() => {
      this.warmTabScheduled = false;
      this.initWarmTab();
    }, delayMs);
  }

  private initWarmTab() {
    if (!this._userId) return;

    // Destroy previous warm tab if still alive
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      this.warmTab.view.webContents.destroy();
    }

    const tab = new Tab(this.window.id);
    tab.view.setBackgroundColor(this.figmaThemeBgColor);
    const url = new URL(NEW_PROJECT_TAB_URL);
    url.searchParams.set("fuid", this._userId);
    tab.loadUrl(url.toString());

    this.warmTab = tab;
    this.warmTabCreatedAt = Date.now();
    logger.debug("WarmTab: initialized");
  }

  private refreshWarmTabIfStale() {
    const isAlive = this.warmTab && !this.warmTab.view.webContents.isDestroyed();
    const isStale = Date.now() - this.warmTabCreatedAt > Window.WARM_TAB_TTL;

    if (!isAlive || isStale) {
      this.scheduleWarmTab(0);
    }
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.window as any).on("show", this.showHandler.bind(this));
    this.window.on("resize", this.updateTabsBounds.bind(this));
    this.window.on("maximize", () => setTimeout(this.updateAllTabsBounds.bind(this), 100));
    this.window.on("unmaximize", () => setTimeout(this.updateAllTabsBounds.bind(this), 100));
    this.window.on("move", () => setTimeout(this.updateTabsBounds.bind(this), 100));
    this.window.on("focus", () => {
      app.emit("windowFocus", this.window.id);
      this.refreshWarmTabIfStale();
    });
    this.window.on("enter-full-screen", this.onEnterFullScreen.bind(this));
    this.window.on("leave-full-screen", this.onLeaveFullScreen.bind(this));
    this.window.webContents.on("did-finish-load", this.webContentDidFinishLoad.bind(this));
  }

  private detachLastFocusedTab() {
    const lastFocusedId = this.tabManager.lastFocusedTab;
    if (lastFocusedId) {
      const lastTab = this.tabManager.getById(lastFocusedId);
      if (lastTab && lastTab.view) {
        // Ensure we don't try to remove a view that isn't attached or is destroyed
        try {
          this.window.contentView.removeChildView(lastTab.view);
        } catch (e) {
          // Ignore errors if child is not attached
        }
      }
    }
  }
}
