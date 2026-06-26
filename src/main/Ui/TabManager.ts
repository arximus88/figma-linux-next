import type { Rectangle } from "electron";

import { NEW_FILE_TAB_TITLE, RECENT_FILES } from "Const";
import { parseURL } from "Utils/Common";
import CommunityTab from "./CommunityTab";
import MainTab from "./MainTab";
import Tab from "./Tab";

export default class TabManager {
  public mainTab: MainTab;
  public communityTab: CommunityTab | undefined;
  public hasOpenedNewFileTab: boolean = false;
  public hasOpenedCommunityTab: boolean = false;

  public lastFocusedTab: number | undefined;
  private tabs: Map<number, Tab> = new Map();

  public get mainTabWebContentId() {
    return this.mainTab.view.webContents.id;
  }
  public get communityTabWebContentId() {
    return this.communityTab ? this.communityTab.view.webContents.id : undefined;
  }

  constructor(private windowId: number) {
    this.mainTab = new MainTab(this.windowId);
    this.lastFocusedTab = this.mainTab.id;

    this.registerEvents();
  }

  public setUserId(id: string) {
    this.mainTab.setUserId(id);
  }
  public addTab(url = RECENT_FILES, title?: string): Tab {
    const tab = new Tab(this.windowId);

    tab.title = title;
    tab.loadUrl(url);
    this.tabs.set(tab.id, tab);

    if (title === NEW_FILE_TAB_TITLE) {
      this.hasOpenedNewFileTab = true;
    }

    return tab;
  }

  /** Promote a pre-warmed Tab (already loaded in background) into the active tab list. */
  public promoteWarmTab(tab: Tab): void {
    tab.title = NEW_FILE_TAB_TITLE;
    this.tabs.set(tab.id, tab);
    this.hasOpenedNewFileTab = true;
  }

  public addCommunityTab() {
    this.communityTab = new CommunityTab(this.windowId);
  }
  public closeCommunityTab() {
    if (this.communityTab.view.webContents && !this.communityTab.view.webContents.isDestroyed()) {
      this.communityTab.view.webContents.destroy();
    }

    this.communityTab = undefined;
  }
  public handleCallbackForTab(webContentsId: number, callbackID: number, args: unknown) {
    const tab = this.getById(webContentsId);

    if (tab) {
      tab.view.webContents.send("handleCallback", callbackID, args);
    }
  }

  public closeAll() {
    for (const tab of this.tabs.values()) {
      if (tab.view?.webContents && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.destroy();
      }
    }
    this.tabs.clear();
  }
  public close(tabId: number): Types.TabIdType {
    const tab = this.tabs.get(tabId);
    const array = [...this.tabs.entries()];
    let nextTabId: Types.TabIdType;

    if (!tab) {
      this.tabs.delete(tabId);
      return this.hasOpenedCommunityTab ? "communityTab" : "mainTab";
    }

    for (let i = 0; i < array.length; i++) {
      const tab = array[i];
      const next = array[i + 1];

      if (!next) {
        break;
      }
      if (tab[0] === tabId) {
        nextTabId = next[0];
        break;
      }

      nextTabId = tab[0];
    }

    if (tab.view?.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.destroy();
    }
    if (tab.title === NEW_FILE_TAB_TITLE) {
      this.hasOpenedNewFileTab = false;
    }

    this.tabs.delete(tabId);

    if (!nextTabId) {
      nextTabId = this.hasOpenedCommunityTab ? "communityTab" : "mainTab";
    }

    return nextTabId;
  }

  public reloadAll() {
    this.tabs.forEach((t) => {
      if (!t.view.webContents.isDestroyed()) {
        t.view.webContents.reload();
      }
    });
  }
  public updateScaleAll(scale: number) {
    this.mainTab.updateScale(scale);
    if (this.communityTab) this.communityTab.updateScale(scale);
    this.tabs.forEach((t) => {
      t.updateScale(scale);
    });
  }

  public getNextTabId(currentId: Types.TabIdType | undefined): number | undefined {
    const ids = [...this.tabs.keys()];
    if (ids.length === 0) return undefined;
    const idx = typeof currentId === "number" ? ids.indexOf(currentId) : -1;
    return ids[(idx + 1) % ids.length];
  }

  public getPrevTabId(currentId: Types.TabIdType | undefined): number | undefined {
    const ids = [...this.tabs.keys()];
    if (ids.length === 0) return undefined;
    const idx = typeof currentId === "number" ? ids.indexOf(currentId) : 0;
    return ids[(idx - 1 + ids.length) % ids.length];
  }

  public getTabByIndex(index: number) {
    let i = 0;
    let foundTab: Types.Tab | undefined;

    this.tabs.forEach((tab) => {
      if (index === i) {
        foundTab = tab;
      }

      i++;
    });

    return foundTab;
  }

  public getTabIndex(webContentsId: number) {
    let i = 0;

    this.tabs.forEach((_, id) => {
      if (webContentsId === id) {
        return;
      }

      i++;
    });

    return i;
  }

  public reloadTab(tabId: number) {
    const tab = this.getById(tabId);

    if (tab) {
      tab.view.webContents.reload();
    }
  }
  public loadUrlInMainTab(url: string) {
    this.mainTab.loadUrl(url);
  }
  public loadUrlInCommunityTab(url: string) {
    this.communityTab.loadUrl(url);
  }
  public loadLoginPage() {
    this.mainTab.loadLoginPage();
  }
  public handleUrl(path: string) {
    this.mainTab.handleUrl(path);
  }
  public getById(id: Types.TabIdType): Tab | MainTab | CommunityTab | undefined {
    switch (id) {
      case "mainTab": {
        return this.mainTab;
      }
      case "communityTab": {
        return this.communityTab;
      }
      default: {
        if (this.tabs.has(id as number)) {
          return this.tabs.get(id as number);
        } else if (this.mainTab.id === id) {
          return this.mainTab;
        } else if (this.communityTab && this.communityTab.id === id) {
          return this.communityTab;
        }
      }
    }

    return undefined;
  }
  public getByTitle(title: string) {
    let foundTab: Tab | undefined;

    this.tabs.forEach((tab) => {
      if (tab.title === title) {
        foundTab = tab;
      }
    });

    return foundTab;
  }
  public getByPath(path: string) {
    let foundTab: Tab | undefined;

    this.tabs.forEach((tab) => {
      const pathname = parseURL(tab.url ?? tab.getUrl())?.pathname;
      if (!pathname) return;
      const reg = new RegExp(pathname);
      if (reg.test(path)) {
        foundTab = tab;
      }
    });

    return foundTab;
  }
  public getAll = () => this.tabs;

  public focusTab(id: Types.TabIdType) {
    const tab = this.getById(id);

    if (tab) {
      this.lastFocusedTab = tab.id;
    }
  }
  public setTitle(id: number, title: string) {
    const tab = this.getById(id);
    if (!tab) return;

    if (tab instanceof Tab) {
      tab.title = title;
    }
  }
  public setBounds(id: number, bounds: Rectangle) {
    const tab = this.getById(id);

    if (tab) {
      tab.setBounds(bounds);
    }
  }
  public focusMainTab() {
    this.lastFocusedTab = this.mainTab.id;
  }
  public focusCommunityTab() {
    this.lastFocusedTab = this.communityTab.id;
  }
  public setBoundsForActiveTab(bounds: Rectangle) {
    this.mainTab.setBounds(bounds);
    const active = this.getById(this.lastFocusedTab);
    if (active && active !== this.mainTab) {
      active.setBounds(bounds);
    }
  }

  public setBoundsForAllTab(bounds: Rectangle) {
    this.mainTab.setBounds(bounds);

    if (this.hasOpenedCommunityTab) {
      this.communityTab.setBounds(bounds);
    }

    for (const [_, tab] of this.tabs) {
      tab.setBounds(bounds);
    }
  }
  public sortTabs(tabs: Types.TabFront[]) {
    const entries = [...this.tabs.entries()];

    this.tabs.clear();

    for (const tab of tabs) {
      const needed = entries.find(([_, t]) => t.id === tab.id);

      this.tabs.set(needed[0], needed[1]);
    }
  }

  public getTabUrl(tabId: number) {
    const tab = this.tabs.get(tabId);

    return tab.view.webContents.getURL();
  }

  public isNewFileTab(tabId: number) {
    for (const [_, tab] of this.tabs) {
      if (tab.title && tab.title === NEW_FILE_TAB_TITLE && tab.id === tabId) {
        return true;
      }
    }

    return false;
  }
  public isMainTab(tabId: number) {
    const keys = [...this.tabs.keys()];

    if (keys[0] === tabId) {
      return true;
    }

    return false;
  }

  public handlePluginMenuAction(pluginMenuAction: Menu.MenuAction) {
    const tab = this.getById(this.lastFocusedTab);

    if (tab) {
      tab.view.webContents.send("handlePluginMenuAction", pluginMenuAction);
    }
  }

  public getActiveTabPath(): string {
    const tab = this.getById(this.lastFocusedTab);
    if (!tab) return "";
    const tabUri = tab.view.webContents.getURL();

    return parseURL(tabUri)?.pathname ?? "";
  }

  private registerEvents() {}
}
