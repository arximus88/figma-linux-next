import { app, clipboard, IpcMainEvent, WebContents } from "electron";

import Window from "./Window";
import Tab from "./Tab";
import MenuManager from "./MenuManager";
import { storage } from "Main/Storage";
import { CHROME_GPU, NEW_FILE_TAB_TITLE } from "Const";
import { WINDOW_DEFAULT_OPTIONS } from "Const/window";
import { normalizeUrl, isAppAuthRedeem } from "Utils/Common";
import { ipcRegistry } from "Main/controllers/registry";
import { logger } from "Main/Logger";

export default class WindowManager {
  private menuManager: MenuManager;

  private lastFocusedwindowId: number;
  private windows: Map<number, Window> = new Map();
  private closedTabs: Map<string, Types.SavedTab> = new Map();

  constructor() {
    this.menuManager = new MenuManager();

    this.restoreData();
    this.registerAppEvents();
  }

  // ── Public API (used by controllers) ──────────────────────────────

  public get closedTabsForMenu() {
    const list = [...this.closedTabs.values()].reverse();

    if (list.length > 10) {
      list.length = 10;
    }

    return list;
  }

  public openUrl(url: string): void {
    const window = this.windows.get(this.lastFocusedwindowId);
    if (window) {
      window.openUrl(url);
    }
  }

  public getWindowByWebContentsId(webContentsId: number): Window | undefined {
    for (const [_, window] of this.windows) {
      if (window.allWebContentsIds.includes(webContentsId)) {
        return window;
      }
    }
  }

  public getLastFocusedWindow(): Window | undefined {
    return this.windows.get(this.lastFocusedwindowId);
  }

  public closeSettingsViewForLastWindow() {
    const window = this.windows.get(this.lastFocusedwindowId);
    if (window) {
      window.closeSettingsView();
    }
  }

  public openChangelogViewForLastWindow() {
    const window = this.windows.get(this.lastFocusedwindowId) ?? this.windows.values().next().value;
    if (window) {
      window.openChangelogView();
    }
  }

  public closeChangelogViewForLastWindow() {
    const window = this.windows.get(this.lastFocusedwindowId);
    if (window) {
      window.closeChangelogView();
    }
  }

  public updatePanelScaleAllWindows(scale: number) {
    for (const [_, window] of this.windows) {
      window.updatePanelScale(null, scale);
    }
  }

  public updateFigmaUiScaleAllWindows(scale: number) {
    for (const [_, window] of this.windows) {
      window.updateFigmaUiScale(null, scale);
    }
  }

  public setFrameStyleAllWindows(style: Types.FrameStyle) {
    for (const [_, window] of this.windows) {
      window.setFrameStyle(style);
    }
  }

  public closeTabOnAllWindows() {
    for (const [_, window] of this.windows) {
      window.closeAllTab(null);
    }
  }

  public loadLoginPageAllWindows() {
    for (const [_, window] of this.windows) {
      window.loadLoginPageAllWindows();
    }
  }

  public handleUrl(urlPath: string) {
    const window = this.windows.get(this.lastFocusedwindowId);
    if (window) {
      window.handleUrl(urlPath);
    }
  }

  public reloadAllWindows() {
    for (const [_, window] of this.windows) {
      window.reload();
    }
  }

  public tryHandleAppAuthRedeemUrl = (url: string): boolean => {
    if (!isAppAuthRedeem(url)) return false;

    // Navigate MainTab to https://www.figma.com/app_auth/redeem?g_secret=...
    // Server validates the secret, sets figma_session via Set-Cookie, and 302s
    // to /files/recent. The legacy IPC path (forward g_secret over webPort) is
    // unreliable because the /login page doesn't establish the __figmaDesktop
    // bridge, so webPort is undefined and the message is silently dropped.
    const normalized = normalizeUrl(url);
    const window = this.windows.get(this.lastFocusedwindowId) ?? this.windows.values().next().value;
    if (!window) return false;
    window.loadUrlMainTab(normalized);
    return true;
  };

  public focusLastWindow() {
    const window = this.windows.get(this.lastFocusedwindowId);

    if (window) {
      window.focus();
    }
  }

  public saveState() {
    if (this.windows.size === 0) {
      // Nothing to snapshot. Preserve whatever was last persisted —
      // windowClose() snapshots the closing window's state before
      // removing it from the map, and we must not wipe that with an
      // empty reset on the follow-up call from quitApp / window-all-closed.
      return;
    }
    storage.settings.app.windowsState = {};
    const keepTabs = storage.settings.app.saveLastOpenedTabs;

    for (const [_, window] of this.windows) {
      try {
        const { windowId, ...state } = window.getState();

        if (!keepTabs) state.tabs = [];

        storage.settings.app.windowsState[windowId] = state;
      } catch (error) {
        // A single dead window must not abort the rest of state save or
        // prevent app.quit() in the window-all-closed path.
        logger.warn("saveState: failed to snapshot window, skipping", error);
      }
    }
  }

  // ── State Management ──────────────────────────────────────────────

  public newWindowFromMenu(_windowId: number) {
    this.newWindow();
  }

  public newWindow(windowState: Types.WindowState = WINDOW_DEFAULT_OPTIONS) {
    const menu = this.menuManager.getMenu({
      recentClosedTabsMenuData: this.closedTabsForMenu,
      actionCheckedState: {
        "close-tab": false,
      },
    });

    const window = new Window(windowState);

    this.lastFocusedwindowId = window.id;
    this.windows.set(window.id, window);

    // Force initial bounds update now that the window is registered
    window.updateTabsBounds();

    if (windowState.x === -1 || windowState.y === -1) {
      window.win.center();
      const bounds = window.win.getBounds();
      windowState.x = bounds.x;
      windowState.y = bounds.y;
    }

    window.focus();
    window.setMenu(menu);
  }

  public restoreState() {
    if (
      !storage.settings.app.windowsState ||
      Object.keys(storage.settings.app.windowsState).length === 0
    ) {
      this.newWindow();
      return;
    }

    const windowsStates = Object.values(storage.settings.app.windowsState);

    for (const state of windowsStates) {
      this.newWindow(state);
    }
  }

  // ── IPC Registration (via IpcRegistry) ────────────────────────────

  public registerIpcHandlers() {
    // Window/tab operations
    ipcRegistry.on("frontReady", this.handleFrontReady.bind(this), "WindowManager");
    ipcRegistry.on("windowClose", this.handlerWindowClose.bind(this), "WindowManager");
    ipcRegistry.on("windowMinimize", this.windowMinimize.bind(this), "WindowManager");
    ipcRegistry.on("windowMaximize", this.windowMaximize.bind(this), "WindowManager");
    ipcRegistry.on("setFocusToMainTab", this.setFocusToMainTab.bind(this), "WindowManager");
    ipcRegistry.on("newProject", this.newProject.bind(this), "WindowManager");
    ipcRegistry.on("closeTab", this.closeTab.bind(this), "WindowManager");
    ipcRegistry.on("setTabFocus", this.setTabFocus.bind(this), "WindowManager");
    ipcRegistry.on("closeAllTab", this.closeAllTab.bind(this), "WindowManager");
    ipcRegistry.on("setLoading", this.setLoading.bind(this), "WindowManager");
    ipcRegistry.on("openSettingsView", this.openSettingsView.bind(this), "WindowManager");
    ipcRegistry.on("openChangelogView", this.openChangelogView.bind(this), "WindowManager");

    // Community tab
    ipcRegistry.on("closeCommunityTab", this.closeCommunityTab.bind(this), "WindowManager");
    ipcRegistry.on(
      "setFocusToCommunityTab",
      this.setFocusToCommunityTab.bind(this),
      "WindowManager",
    );

    // Menu operations
    ipcRegistry.on("openMainMenu", this.openMainMenuHandler.bind(this), "WindowManager");
    ipcRegistry.on("openTabMenu", this.openTabMenuHandler.bind(this), "WindowManager");
    ipcRegistry.on("openMainTabMenu", this.openMainTabMenuHandler.bind(this), "WindowManager");
    ipcRegistry.on(
      "openCommunityTabMenu",
      this.openCommunityTabMenuHandler.bind(this),
      "WindowManager",
    );

    // Tab content events (from Figma web app via DesktopAPI)
    ipcRegistry.on("setFigmaTheme", this.setFigmaTheme.bind(this), "WindowManager");
    ipcRegistry.on("setTitle", this.setTabTitle.bind(this), "WindowManager");
    ipcRegistry.on("setTabEditorType", this.setTabEditorType.bind(this), "WindowManager");
    ipcRegistry.on("setTabIsLibrary", this.setTabIsLibrary.bind(this), "WindowManager");
    ipcRegistry.on("setTabUrl", this.setTabUrl.bind(this), "WindowManager");
    ipcRegistry.on("openFile", this.openFile.bind(this), "WindowManager");
    ipcRegistry.on("openCommunity", this.openCommunity.bind(this), "WindowManager");
    ipcRegistry.on(
      "updateVisibleNewProjectBtn",
      this.updateVisibleNewProjectBtn.bind(this),
      "WindowManager",
    );
    ipcRegistry.on(
      "updateFullscreenMenuState",
      this.updateFullscreenMenuState.bind(this),
      "WindowManager",
    );
    ipcRegistry.on(
      "toggleCurrentWindowFullscreen",
      this.toggleCurrentWindowFullscreen.bind(this),
      "WindowManager",
    );

    // Voice call
    ipcRegistry.on("setUsingMicrophone", this.setUsingMicrophone.bind(this), "WindowManager");
    ipcRegistry.on("setIsInVoiceCall", this.setIsInVoiceCall.bind(this), "WindowManager");

    // Dev tools
    ipcRegistry.on("openDevTools", this.openDevTools.bind(this), "WindowManager");

    // Settings - moved to SettingsController:
    // "closeSettingsView", "selectExportDirectory", "updatePanelScale",
    // "updateFigmaUiScale", "themesIsDisabled", "isDevToolsOpened"

    // Auth - moved to AuthController:
    // "startAppAuth", "finishAppAuth", "setInitialOptions", "setUser", "setAuthedUsers"

    // Files - moved to FileController:
    // "writeFiles", "createFile"
  }

  // ── Private Handlers ──────────────────────────────────────────────

  private restoreData() {
    const recentlyClosedTabs = storage.settings.app.recentlyClosedTabs;

    if (recentlyClosedTabs?.length > 0) {
      for (const tabInfo of recentlyClosedTabs.reverse()) {
        this.closedTabs.set(tabInfo.title, {
          title: tabInfo.title,
          url: tabInfo.url,
        });
      }
    }
  }

  private openUrlInNewTab(url: string) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.openUrl(url);
  }
  private openUrlFromCommunity(url: string) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.openUrlFromCommunity(url);
  }
  private sendWindowBoundsToTabs(windowId: number) {
    for (const [id, window] of this.windows) {
      if (id === windowId) {
        window.updateTabsBounds();
      }
    }
  }

  private newFile(_: WebContents) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.newProject();
  }
  private reloadTabFromMenu(tabId: number) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.reloadTab(tabId);
  }
  private closeTabFromMenu(windowId: number, tabId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    this.handleCloseTab(window, tabId);
  }
  private focusNextTabFromMenu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);
    window?.focusNextTab();
  }
  private focusPrevTabFromMenu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);
    window?.focusPrevTab();
  }
  private closeCurrentTabFromMenu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);
    const tabId = window.getLatestFocusedTabId();

    if (tabId) {
      this.handleCloseTab(window, tabId);
    }
  }
  private closeCurrentWindowFromMenu(windowId: number) {
    this.windowClose(windowId);
  }
  private toggleCurrentWindowFullscreen(event: IpcMainEvent) {
    const window = this.getWindowByWebContentsId(event.sender.id || this.lastFocusedwindowId);

    window.toggleFullScreen();
  }
  private toggleCurrentWindowFullscreenFromMenu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.toggleFullScreen();
  }
  private reopenClosedTabFromMenu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.restoreTabs(this.closedTabsForMenu);
  }
  private handleCloseTab(window: Window, tabId: number) {
    const tabInfo = window.getTabInfo(tabId);

    if (tabInfo && tabInfo.title !== NEW_FILE_TAB_TITLE) {
      this.closedTabs.delete(tabInfo.title);
      this.closedTabs.set(tabInfo.title, {
        title: tabInfo.title,
        url: tabInfo.url,
      });
    }

    storage.settings.app.recentlyClosedTabs = this.closedTabsForMenu;

    window.closeTab(tabId);
    window.tabWasClosed(tabId);
  }

  private chromeGpu(windowId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.addTab(CHROME_GPU, CHROME_GPU);
  }
  private openFileUrlClipboard() {
    const window = this.windows.get(this.lastFocusedwindowId);
    const uri = clipboard.readText();

    window.openUrl(uri);
  }
  private openFileBrowser() {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.setFocusToMainTab();
  }
  private restoreClosedTab(windowId: number, title: string, uri: string) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.addTab(uri, title);
  }
  private openDevTools(event: IpcMainEvent, mode: "right" | "bottom" | "undocked" | "detach") {
    if (event.sender) {
      event.sender.openDevTools({ mode });
    }
  }

  private closeTab(_: IpcMainEvent, tabId: number) {
    const window = this.windows.get(this.lastFocusedwindowId);

    this.handleCloseTab(window, tabId);
  }
  private closeCommunityTab(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.closeCommunityTab();
  }
  private setFocusToCommunityTab(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.setFocusToCommunityTab();
  }
  private setTabFocus(_: IpcMainEvent, tabId: number) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.setTabFocus(tabId);
  }

  private windowFocus(windowId: number) {
    this.lastFocusedwindowId = windowId;
  }
  private handlerWindowClose(_: IpcMainEvent, tabs: Types.TabFront[]) {
    this.sortTabs(this.lastFocusedwindowId, tabs);
    this.windowClose(this.lastFocusedwindowId);
  }
  private sortTabs(windowId: number, tabs: Types.TabFront[]) {
    const window = this.windows.get(windowId);

    window.sortTabs(tabs);
  }

  private windowClose(windowId: number) {
    const window = this.windows.get(windowId);

    window.close();

    if (this.windows.size === 1) {
      // Snapshot state while the closing window is still in the map.
      // app.emit("quitApp") below triggers App.quitApp → saveState(),
      // which iterates this.windows; if we deleted first, the only
      // window would be gone and windowsState would persist as {},
      // defeating the "saveLastOpenedTabs" setting.
      this.saveState();
    }

    this.windows.delete(windowId);

    if (this.windows.size === 0) {
      app.emit("quitApp");
    }
  }
  private setFocusToMainTab(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.setFocusToMainTab();
  }
  private openTabMenuHandler(_: IpcMainEvent, tabId: number) {
    const window = this.windows.get(this.lastFocusedwindowId);
    const tabInfo = window.getTabInfo(tabId);
    if (!tabInfo) return;

    this.menuManager.openTabMenuHandler(window.win, tabId, tabInfo.url);
  }
  private openMainTabMenuHandler(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);
    const mainTabInfo = window.mainTabInfo;

    this.menuManager.openMainTabMenuHandler(window.win, mainTabInfo.id, mainTabInfo.url);
  }
  private openCommunityTabMenuHandler(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);
    const communityTabInfo = window.communityTabInfo;

    this.menuManager.openCommunityTabMenuHandler(
      window.win,
      communityTabInfo.id,
      communityTabInfo.url,
    );
  }
  private needUpdateMenu(
    windowId: number,
    tabId?: number,
    actionCheckedState: { [key: string]: boolean } = {},
  ) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);
    let state: Menu.State = {
      recentClosedTabsMenuData: this.closedTabsForMenu,
      actionCheckedState,
    };

    if (tabId) {
      const tabMenuState = this.menuManager.getTabMenu(tabId);
      state = {
        ...state,
        ...tabMenuState,
        actionCheckedState: {
          ...(state?.actionCheckedState ?? {}),
          ...(tabMenuState?.actionCheckedState ?? {}),
          "close-tab": true,
        },
      };
    }

    const menu = this.menuManager.getMenu(state);

    window.setMenu(menu);
  }
  private newProject(_: IpcMainEvent) {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.newProject();
  }
  private closeAllTab() {
    const window = this.windows.get(this.lastFocusedwindowId);
    if (window) {
      window.closeAllTab(null);
    }
  }

  private handlePluginManageAction() {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.handlePluginManageAction("manage");
  }
  private handleWidgetManageAction() {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.handlePluginManageAction("manage-widgets");
  }
  private handlePluginMenuAction(windowId: number, pluginMenuAction: Menu.MenuAction) {
    const window = this.windows.get(windowId ?? this.lastFocusedwindowId);

    window.handlePluginMenuAction(pluginMenuAction);
  }
  private toggleSettingsDevTools(windowId: number, _webContentId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.toggleSettingsDevTools();
  }
  private toggleCurrentTabDevTools(windowId: number, _webContentsId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.toggleCurrentTabDevTools();
  }
  private toggleCurrentWindowDevTools(windowId: number, _webContentId: number) {
    const window = this.windows.get(windowId || this.lastFocusedwindowId);

    window.toggleDevTools();
  }
  private updateFullscreenMenuState(event: IpcMainEvent, state: Menu.State) {
    const tabId = event.sender.id;
    const window = this.getWindowByWebContentsId(tabId);

    this.menuManager.setTabMenu(tabId, state);

    this.needUpdateMenu(window.id, tabId);
  }

  private setIsInVoiceCall(event: IpcMainEvent, isInVoiceCall: boolean) {
    const window = this.windows.get(this.lastFocusedwindowId);
    const tabId = event.sender.id;

    window.setIsInVoiceCall(tabId, isInVoiceCall);
  }
  private setUsingMicrophone(event: IpcMainEvent, isUsingMicrophone: boolean) {
    const window = this.windows.get(this.lastFocusedwindowId);
    const tabId = event.sender.id;

    window.setUsingMicrophone(tabId, isUsingMicrophone);
  }

  private setFigmaTheme(_: IpcMainEvent, theme: "dark" | "light") {
    if (theme !== "dark" && theme !== "light") return;
    if (storage.settings.app.figmaTheme === theme) return;
    storage.settings.app.figmaTheme = theme;
    storage.save();
  }
  private setTabTitle(event: IpcMainEvent, title: string) {
    const window = this.getWindowByWebContentsId(event.sender.id);
    if (!window) return;
    window.setTabTitle(event, title);
  }
  private setTabEditorType(event: IpcMainEvent, type: Types.EditorType) {
    const window = this.getWindowByWebContentsId(event.sender.id);
    if (!window) return;
    const tab = window.tabs.get(event.sender.id);
    if (tab instanceof Tab) {
      logger.info(`[editor-type] tab ${tab.id} url=${tab.url ?? "?"} type=${type}`);
      tab.setEditorType(type);
    }
  }
  private setTabIsLibrary(event: IpcMainEvent, isLibrary: boolean) {
    const window = this.getWindowByWebContentsId(event.sender.id);
    if (!window) return;
    const tab = window.tabs.get(event.sender.id);
    if (tab instanceof Tab) tab.setIsLibrary(isLibrary);
  }
  private setTabUrl(event: IpcMainEvent, url: string) {
    const window = this.getWindowByWebContentsId(event.sender.id);
    if (!window) return;
    const tab = window.tabs.get(event.sender.id);
    if (tab instanceof Tab) tab.updateUrlAndDeriveType(url);
  }
  private openFile(event: IpcMainEvent, ...args: string[]) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    window.openFile(event, ...args);
  }
  private openCommunity(event: IpcMainEvent, args: WebApi.OpenCommunity) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    window.openCommunity(args);
  }
  private updateVisibleNewProjectBtn(event: IpcMainEvent, visible: boolean) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    window.updateVisibleNewProjectBtn(event, visible);
  }

  private handleFrontReady(event: IpcMainEvent) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    window.handleFrontReady();
  }
  private openMainMenuHandler(event: IpcMainEvent) {
    const window = this.getWindowByWebContentsId(event.sender.id);
    const width = window.getBounds().width;

    this.menuManager.openMainMenuHandler(
      width,
      window.win,
      window.openMainMenuCloseHandler.bind(window),
    );
  }
  private openSettingsView() {
    const window = this.windows.get(this.lastFocusedwindowId);

    window.openSettingsView();
  }
  private openChangelogView() {
    this.openChangelogViewForLastWindow();
  }
  private handleCallbackForTab(webContentsId: number, cbId: number, args: any) {
    const window = this.getWindowByWebContentsId(webContentsId);

    window.handleCallbackForTab(webContentsId, cbId, args);
  }
  private windowMinimize(event: IpcMainEvent) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    if (window) {
      window.windowMinimize(event);
    }
  }
  private windowMaximize(event: IpcMainEvent) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    if (window) {
      window.windowMaximize(event);
    }
  }
  private setLoading(event: IpcMainEvent, args: WebApi.SetLoading) {
    const window = this.getWindowByWebContentsId(event.sender.id);

    window.setLoading(event, args);
  }

  // ── App-level Events (menu actions, window lifecycle) ─────────────

  private registerAppEvents() {
    // Events from main menu
    app.on("newFile", this.newFile.bind(this));
    app.on("newWindow", this.newWindowFromMenu.bind(this));
    app.on("reloadTab", this.reloadTabFromMenu.bind(this));
    app.on("closeTab", this.closeTabFromMenu.bind(this));
    app.on("focusNextTab", this.focusNextTabFromMenu.bind(this));
    app.on("focusPrevTab", this.focusPrevTabFromMenu.bind(this));
    app.on("closeCurrentTab", this.closeCurrentTabFromMenu.bind(this));
    app.on("reopenClosedTab", this.reopenClosedTabFromMenu.bind(this));
    app.on("closeCurrentWindow", this.closeCurrentWindowFromMenu.bind(this));
    app.on("toggleWindowFullscreen", this.toggleCurrentWindowFullscreenFromMenu.bind(this));
    app.on("closeCommunityTab", this.closeCommunityTab.bind(this));
    app.on("closeAllTab", this.closeAllTab.bind(this));
    app.on("chromeGpu", this.chromeGpu.bind(this));
    app.on("openFileUrlClipboard", this.openFileUrlClipboard.bind(this));
    app.on("openFileBrowser", this.openFileBrowser.bind(this));
    app.on("restoreClosedTab", this.restoreClosedTab.bind(this));
    app.on("openSettingsView", this.openSettingsView.bind(this));
    app.on("openChangelogView", this.openChangelogView.bind(this));
    // End events from main menu

    app.on("focusLastWindow", this.focusLastWindow.bind(this));
    app.on("requestBoundsForTabView", this.sendWindowBoundsToTabs.bind(this));
    app.on("openUrlInNewTab", this.openUrlInNewTab.bind(this));
    app.on("openUrlFromCommunity", this.openUrlFromCommunity.bind(this));
    app.on("windowFocus", this.windowFocus.bind(this));
    app.on("windowClose", this.windowClose.bind(this));
    app.on("handleUrl", this.handleUrl.bind(this));
    app.on("handlePluginManageAction", this.handlePluginManageAction.bind(this));
    app.on("handleWidgetManageAction", this.handleWidgetManageAction.bind(this));
    app.on("handlePluginMenuAction", this.handlePluginMenuAction.bind(this));
    app.on("toggleCurrentWindowDevTools", this.toggleCurrentWindowDevTools.bind(this));
    app.on("toggleSettingsDeveloperTools", this.toggleSettingsDevTools.bind(this));
    app.on("toggleCurrentTabDevTools", this.toggleCurrentTabDevTools.bind(this));
    app.on("needUpdateMenu", this.needUpdateMenu.bind(this));
    app.on("handleCallbackForTab", this.handleCallbackForTab.bind(this));
  }
}
