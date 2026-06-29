import { app, BrowserWindow, type IpcMainEvent, type Rectangle, type Menu } from "electron";
import { storage } from "Main/Storage";
import SettingsView from "./SettingsView";
import ChangelogView from "./ChangelogView";
import { ModalViewManager } from "./ModalViewManager";
import TabManager from "./TabManager";
import { WarmTabManager } from "./WarmTabManager";
import { WindowGeometry } from "./WindowGeometry";
import { logger } from "../Logger";

import { HOMEPAGE, TOPPANELHEIGHT, NEW_PROJECT_TAB_URL, NEW_FILE_TAB_TITLE } from "Const";
import { WINDOW_DEFAULT_OPTIONS } from "Const/window";
import {
  isDev,
  isCommunityUrl,
  isFileBrowserUrl,
  isFigmaRunUrl,
  parseURL,
  getTabDedupKey,
} from "Utils/Common";
import { panelUrlDev, panelUrlProd, toggleDetachedDevTools } from "Utils/Main";
import Tab from "./Tab";

export default class Window {
  private window: BrowserWindow;
  private geometry: WindowGeometry;
  private tabManager: TabManager;
  private settingsView: SettingsView;
  private changelogView: ChangelogView;
  private modalViews: ModalViewManager;
  private state: Types.WindowState;
  // Single-shot guard so the explicit pre-closeAll snapshot in close() is
  // not overwritten by the BrowserWindow `close` event firing later with
  // an already-cleared tabs map.
  private stateCached = false;

  private _userId: string;
  private shown = false;
  private static readonly SHOW_FALLBACK_MS = 3000;

  // Loading skeleton is cleared by the Figma SPA's setLoading(false) signal.
  // That signal is occasionally never delivered (dropped bridge message, a
  // navigation Figma doesn't re-signal), leaving a tab stuck in the skeleton
  // forever until a manual reload. The watchdog is a safety net: once the page
  // itself has finished loading, give the SPA a grace window to signal, then
  // force-clear. Override the grace with FIGMA_LOADING_WATCHDOG_MS (tests).
  private static readonly LOADING_WATCHDOG_MS =
    Number(process.env.FIGMA_LOADING_WATCHDOG_MS) || 8000;

  // Warm tab: a pre-loaded "new file" tab kept in background for instant opening.
  private warmTabs: WarmTabManager;

  constructor(state: Types.WindowState) {
    this.window = new BrowserWindow({
      ...WINDOW_DEFAULT_OPTIONS,
      ...state,
      webPreferences: WINDOW_DEFAULT_OPTIONS.webPreferences,
    });
    this.geometry = new WindowGeometry(this.window);
    this.tabManager = new TabManager(this.window.id);
    this.settingsView = new SettingsView();
    this.changelogView = new ChangelogView();
    this.modalViews = new ModalViewManager(this.window, this.settingsView, this.changelogView);
    this.warmTabs = new WarmTabManager(this.window.id, {
      getUserId: () => this._userId,
      getBgColor: () => this.figmaThemeBgColor,
    });
    this.state = state;

    this.window.contentView.addChildView(this.tabManager.mainTab.view);
    this.updateTabsBounds();

    this.registerEvents();

    this.window.loadURL(isDev ? panelUrlDev : panelUrlProd);
    if (isDev) toggleDetachedDevTools(this.window.webContents);
    this.applyState();

    // Hide-until-ready: keep the BrowserWindow hidden until the Panel renderer
    // signals frontReady (see handleFrontReady). ready-to-show fires too early —
    // it lands on Vite's empty HTML before Svelte mounts, producing a flash of
    // a white top strip. The fallback timer guards against a broken renderer
    // leaving the window hidden forever.
    setTimeout(() => this.revealIfHidden(), Window.SHOW_FALLBACK_MS);
  }

  private revealIfHidden() {
    if (this.shown || this.window.isDestroyed()) return;
    this.shown = true;
    this.window.show();
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
  public get changelogViewId() {
    return this.changelogView.view.webContents.id;
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
      this.changelogViewId,
      this.tabManager.mainTabWebContentId,
      ...this.tabs.keys(),
    ]);

    if (this.tabManager.communityTabWebContentId) {
      ids.add(this.tabManager.communityTabWebContentId);
    }
    // Include warm tab so IPC messages from it can be routed to this window
    const warmId = this.warmTabs.activeWebContentsId;
    if (warmId !== null) {
      ids.add(warmId);
    }

    return [...ids];
  }

  public setUserId(id: string) {
    const previousId = this._userId;
    this._userId = id;
    this.tabManager.setUserId(id);

    // The warm tab bakes the user id into its URL, so an account switch
    // invalidates it. Tear down + reschedule (and schedule on first boot).
    this.warmTabs.onUserIdChanged(previousId, id);
  }
  public sortTabs(tabs: Types.TabFront[]) {
    this.tabManager.sortTabs(tabs);
  }
  public getState(): Types.WindowState & { windowId: number } {
    // During close, cacheStateBeforeClose() snapshots state into this.state
    // BEFORE tabManager.closeAll() clears the tabs map. After closeAll,
    // reading the live this.tabs would return an empty list, persisting
    // tabs:[] and defeating saveLastOpenedTabs. isDestroyed() alone is not
    // enough — BrowserWindow.close() is async, so isDestroyed can still be
    // false while internal state is gone (getBounds throws).
    if (this.stateCached || this.window.isDestroyed()) {
      return { ...this.state, windowId: this.id };
    }

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

  private cacheStateBeforeClose() {
    if (this.stateCached) return;
    if (this.window.isDestroyed()) return;
    const { windowId: _, ...snapshot } = this.getState();
    this.state = snapshot;
    this.stateCached = true;
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
    return this.geometry.calcBoundsForTabView();
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
    if (isCommunityUrl(url)) {
      const parsed = parseURL(url);
      this.handleUrl(`${parsed.pathname}${parsed.search}`);
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
    this.modalViews.syncBounds(this.window.getBounds());
  }

  public updateAllTabsBounds() {
    const bounds = this.calcBoundsForTabView();
    this.tabManager.setBoundsForAllTab(bounds);
    this.modalViews.syncBounds(this.window.getBounds());
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
  public newProject() {
    if (this.tabManager.hasOpenedNewFileTab) {
      return;
    }

    const ready = this.warmTabs.takeWarmTab();
    if (ready) {
      // Promote the pre-warmed tab — instant, no loading delay
      this.tabManager.promoteWarmTab(ready.tab);
      this.window.webContents.send("didTabAdd", {
        id: ready.tab.id,
        url: ready.tab.url,
        title: NEW_FILE_TAB_TITLE,
        // If the SPA hasn't fired its readiness signal yet, render the
        // skeleton — the next setLoading(false) from the SPA clears it.
        // Without this flag, the renderer never paints a placeholder and
        // a not-yet-bootstrapped warm tab promotion shows a blank page.
        loading: !ready.wasBootstrapped,
      });
      this.setTabFocus(ready.tab.id);
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

    // Non-Figma tabs (chrome://gpu, about:*) don't run figmaApi, so Figma's
    // setLoading IPC never arrives. Without this flag the renderer skeleton
    // covers the real title forever. For Figma URLs leave loading default-true;
    // setLoading(false) clears it once the canvas is ready.
    const isFigma = isFigmaRunUrl(url);
    this.window.webContents.send("didTabAdd", {
      id: tab.id,
      url,
      title,
      editorType: tab.editorType,
      loading: isFigma,
    });

    if (isFigma) {
      this.armLoadingWatchdog(tab);
    }

    return tab;
  }

  /**
   * Safety net for a stuck loading skeleton: when the tab's page finishes
   * loading, give the Figma SPA a grace window to fire its own
   * setLoading(false); if it never does, force-clear the skeleton so the tab
   * can't stay in the loading state forever. Idempotent — a redundant
   * setLoading(false) after the SPA already cleared it is harmless. Re-arms on
   * every full load (e.g. a reload), and the destroyed-guard makes a pending
   * timer a no-op once the tab is gone.
   */
  private armLoadingWatchdog(tab: Tab) {
    const wc = tab.view.webContents;
    let timer: ReturnType<typeof setTimeout> | null = null;
    wc.on("did-finish-load", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!wc.isDestroyed()) {
          this.window.webContents.send("setLoading", tab.id, false);
        }
      }, Window.LOADING_WATCHDOG_MS);
    });
  }

  public openSettingsView() {
    this.modalViews.openSettingsView();
  }
  public closeSettingsView() {
    this.modalViews.closeSettingsView();
  }

  public openChangelogView() {
    this.modalViews.openChangelogView();
  }
  public closeChangelogView() {
    this.modalViews.closeChangelogView();
  }
  public get isChangelogViewOpen() {
    return this.modalViews.isChangelogViewOpen;
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
    if (userId) this.setUserId(userId);

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

    // Warm tab signals readiness via setLoading(false). Track it so the
    // promoter knows whether to show the skeleton placeholder — promoting
    // a not-yet-bootstrapped warm tab without the skeleton lands the user
    // on a blank black page until the SPA finally renders.
    if (this.warmTabs.handleSetLoading(tabId, args.loading)) {
      return;
    }

    const tab = this.tabManager.getById(tabId);

    if (!tab) {
      return;
    }

    this.window.webContents.send("setLoading", tabId, args.loading);
  }
  public windowMinimize(_: IpcMainEvent) {
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
        if (this.tabManager.hasOpenedCommunityTab) {
          this.setFocusToCommunityTab();
        } else {
          this.setFocusToMainTab();
        }
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
  public executeInBrowserView(script: string): Promise<unknown> {
    const tab = this.tabManager.getById(this.tabManager.lastFocusedTab);
    if (!tab) return Promise.resolve(undefined);
    return tab.view.webContents.executeJavaScript(script);
  }

  /** Execute a fetch from within the active Figma WebContentsView context.
   *  Uses relative paths on www.figma.com so session cookies are sent automatically.
   *  @param path - relative path, e.g. "/api/files/{key}/nodes?ids=..." */
  public figmaApiFetch(path: string): Promise<unknown> {
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
  public completeFigmaAuthInMainTab(gSecret: string, path?: string) {
    // Forward the g_secret to MainTab's renderer; the page-side handler
    // completes the redeem in-place so multi-user state survives. `path`
    // stays undefined when the auth flow stayed on MainTab — the page may
    // concatenate HOMEPAGE+path on completion, and passing "" or null
    // produces "https://www.figma.comnull/" → empty screen.
    this.tabManager.mainTab.view.webContents.send("figma:complete-auth", gSecret, path);
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
    if (this.warmTabs.isWarmTab(event.sender.id)) return;

    const tab = this.tabManager.getById(event.sender.id);

    if (!tab || (tab instanceof Tab && tab.title === NEW_FILE_TAB_TITLE)) {
      return;
    }

    this.tabManager.setTitle(tab.id, title);
    if (tab?.view?.webContents) {
      this.window.webContents.send("setTitle", { id: tab.view.webContents.id, title });
    }
  }
  public openFile(event: IpcMainEvent, ...args: string[]) {
    let url = `${HOMEPAGE}${args[0]}`;

    if (args[2]) {
      url = `${url}${args[2]}`;
    }

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
  public handleCallbackForTab(webContentsId: number, cbId: number, args: unknown) {
    this.tabManager.handleCallbackForTab(webContentsId, cbId, args);
  }

  public pushSettingsToPanel() {
    this.window.webContents.send("loadSettings", storage.settings);
  }

  public handleFrontReady() {
    this.pushSettingsToPanel();
    this.showHandler(null);
    this.revealIfHidden();
  }

  public close() {
    // Snapshot state while tabs are still alive. tabManager.closeAll()
    // below clears the tabs map; without this explicit call the snapshot
    // taken by the `close` event handler would see tabs:[] and overwrite
    // any previously persisted "saveLastOpenedTabs" payload with an empty
    // list. The stateCached guard then makes the event-driven call a no-op.
    this.cacheStateBeforeClose();

    this.warmTabs.destroy();
    this.modalViews.destroy();
    this.tabManager.closeAll();
    this.window.close();
  }

  private get figmaThemeBgColor(): string {
    return storage.settings.app.figmaTheme === "light" ? "#ffffff" : "#1e1e1e";
  }

  private registerEvents() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.window as any).on("show", this.showHandler.bind(this));
    this.window.on("close", this.cacheStateBeforeClose.bind(this));
    this.window.on("resize", this.updateTabsBounds.bind(this));
    this.window.on("maximize", () => setTimeout(this.updateAllTabsBounds.bind(this), 100));
    this.window.on("unmaximize", () => setTimeout(this.updateAllTabsBounds.bind(this), 100));
    this.window.on("move", () => setTimeout(this.updateTabsBounds.bind(this), 100));
    this.window.on("focus", () => {
      app.emit("windowFocus", this.window.id);
      this.warmTabs.refreshIfStale();
    });
    this.window.on("enter-full-screen", this.onEnterFullScreen.bind(this));
    this.window.on("leave-full-screen", this.onLeaveFullScreen.bind(this));
    this.window.webContents.on("did-finish-load", this.webContentDidFinishLoad.bind(this));
  }

  private detachLastFocusedTab() {
    const lastFocusedId = this.tabManager.lastFocusedTab;
    if (lastFocusedId) {
      const lastTab = this.tabManager.getById(lastFocusedId);
      if (lastTab?.view) {
        // Ensure we don't try to remove a view that isn't attached or is destroyed
        try {
          this.window.contentView.removeChildView(lastTab.view);
        } catch {
          // Ignore errors if child is not attached
        }
      }
    }
  }
}
