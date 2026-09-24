import type { Rectangle } from "electron";

import { NEW_FILE_TAB_TITLE, RECENT_FILES } from "Const";
import { parseURL } from "Utils/Common";
import CommunityTab from "./CommunityTab";
import MainTab from "./MainTab";
import Tab, { allocateLogicalTabId } from "./Tab";

/**
 * A tab whose webContents has been destroyed to free memory (see
 * WindowManager's memory-budget eviction), but whose slot in the tab strip
 * — position, group, title, last-known thumbnail — is kept so clicking it
 * transparently revives it from `url`. Deliberately NOT a `Tab` with a
 * nulled-out `.view`: `Tab.view` is touched unconditionally (no null checks)
 * by most of Tab.ts/TabManager.ts/Window.ts, so a distinct shape that never
 * claims to have a view means every call site that needs a live view is
 * forced (by the type checker, via the existing `instanceof Tab` pattern
 * already used throughout) to handle "this tab isn't loaded right now"
 * instead of crashing the first time a discarded tab is touched by a path
 * nobody thought to test.
 */
export interface DiscardedTab {
  readonly discarded: true;
  id: number;
  title?: string;
  url: string;
  groupId?: string;
  /** Carried over from the live Tab's last capture — never re-captured while discarded (see Tab.captureThumbnail's visibility requirement). */
  thumbnail?: string;
  previewData: Types.TabPreviewData | null;
  editorType?: Types.EditorType;
  isLibrary?: boolean;
  pendingUserId?: string;
}

export default class TabManager {
  public mainTab: MainTab;
  public communityTab: CommunityTab | undefined;
  public hasOpenedNewFileTab: boolean = false;
  public hasOpenedCommunityTab: boolean = false;

  public lastFocusedTab: number | undefined;
  /**
   * Single map, ordered exactly as the tab strip renders (sortTabs reorders
   * this directly) — live and discarded tabs share one ordering so a
   * discarded tab keeps its position instead of needing a second structure
   * kept in sync with this one.
   */
  private tabs: Map<number, Tab | DiscardedTab> = new Map();
  /** Real webContents id -> logical tab id, for the handful of call sites that only have the raw id an IPC event arrived on (event.sender.id). Only live tabs have an entry. */
  private webContentsIndex: Map<number, number> = new Map();

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

  /**
   * Refresh every open project tab so they stop acting as the previous
   * account. A plain reload isn't enough: normal file URLs carry no fuid
   * param, so a bare `webContents.reload()` would re-request the same URL
   * and risk resolving back to whichever identity Figma treats as default —
   * the same reason mainTab/warmTab/addTab always set fuid explicitly
   * instead of relying on it.
   *
   * Only the tab that's actually visible right now is reloaded immediately;
   * every background tab is just marked pending so switching accounts
   * doesn't reload N tabs (and boot N Figma canvases) at once. Deferred tabs
   * catch up in applyPendingUserId, right before they become focused.
   */
  public reapplyUserId(userId: string) {
    this.tabs.forEach((tab) => {
      if (tab.id === this.lastFocusedTab && tab instanceof Tab) {
        this.refreshTabUserId(tab, userId);
      } else {
        // Discarded tabs can't be refreshed live (no webContents) — stash it
        // the same way a background live tab does, so a later revive folds
        // it into the initial load instead of a second navigation.
        tab.pendingUserId = userId;
      }
    });
  }

  /** Apply a deferred account switch (see reapplyUserId) right before a tab is focused. */
  public applyPendingUserId(tabId: number) {
    const tab = this.tabs.get(tabId);
    if (!tab || !(tab instanceof Tab) || tab.pendingUserId === undefined) return;

    this.refreshTabUserId(tab, tab.pendingUserId);
  }

  private refreshTabUserId(tab: Tab, userId: string) {
    tab.pendingUserId = undefined;
    if (tab.view.webContents.isDestroyed()) return;

    const parsedUrl = parseURL(tab.getUrl());
    if (!parsedUrl) return;

    parsedUrl.searchParams.set("fuid", userId);
    tab.loadUrl(parsedUrl.toString());

    // Same family of issue as the "reattached view stays blank" gotcha
    // (Window.swapTo): a loadURL() on an already-visible WebContentsView can
    // land its first frame without the compositor actually presenting it on
    // Wayland/Electron 44 — the page is genuinely showing the new account,
    // it just doesn't paint until another visibility toggle, which is what a
    // manual second click/focus accidentally provides. Force that toggle
    // ourselves once the new page has actually loaded, but only if this tab
    // is still the one on screen (the user may have switched away by then).
    tab.view.webContents.once("did-finish-load", () => {
      if (tab.view.webContents.isDestroyed() || this.lastFocusedTab !== tab.id) return;
      tab.view.setVisible(false);
      tab.view.setVisible(true);
    });
  }
  public addTab(url = RECENT_FILES, title?: string): Tab {
    const tab = new Tab(this.windowId);

    tab.title = title;
    tab.loadUrl(url);
    this.tabs.set(tab.id, tab);
    this.webContentsIndex.set(tab.webContentsId, tab.id);

    if (title === NEW_FILE_TAB_TITLE) {
      this.hasOpenedNewFileTab = true;
    }

    return tab;
  }

  /** Promote a pre-warmed Tab (already loaded in background) into the active tab list. */
  public promoteWarmTab(tab: Tab): void {
    tab.title = NEW_FILE_TAB_TITLE;
    this.tabs.set(tab.id, tab);
    this.webContentsIndex.set(tab.webContentsId, tab.id);
    this.hasOpenedNewFileTab = true;
  }

  /**
   * Insert a tab directly in the discarded state — no WebContentsView is
   * constructed at all, unlike discardTab() which destroys an already-live
   * one. Used for lazy session restore (see Window.restoreTabs): every saved
   * tab except the one that was actually active last session shows up in the
   * strip immediately, but costs nothing until clicked.
   */
  public addDiscardedShell(saved: Types.SavedTab): DiscardedTab {
    const discarded: DiscardedTab = {
      discarded: true,
      id: allocateLogicalTabId(),
      title: saved.title,
      url: saved.url ?? RECENT_FILES,
      groupId: saved.groupId,
      previewData: null,
    };
    this.tabs.set(discarded.id, discarded);

    if (discarded.title === NEW_FILE_TAB_TITLE) {
      this.hasOpenedNewFileTab = true;
    }

    return discarded;
  }

  /**
   * Resolve a live Tab from the real webContents id an IPC event arrived on
   * (event.sender.id) — never a DiscardedTab, since a discarded tab has no
   * webContents left to send an event. Use this instead of a raw
   * `getAll().get(event.sender.id)` anywhere a handler needs "the tab that
   * just sent me this," since after a discard/revive cycle a tab's logical
   * id and its real webContents id are no longer the same number.
   */
  public getByWebContentsId(webContentsId: number): Tab | undefined {
    const logicalId = this.webContentsIndex.get(webContentsId);
    if (logicalId === undefined) return undefined;
    const tab = this.tabs.get(logicalId);
    return tab instanceof Tab ? tab : undefined;
  }

  /**
   * Snapshot a live tab's state and destroy its webContents, keeping its
   * slot (position, group, title, last thumbnail) in the strip so a later
   * click transparently revives it. Caller (Window.discardTab) must detach
   * the view from the window's contentView first, and must already have
   * guarded against discarding the focused tab, the warm tab, a tab mid
   * voice/mic use, or an export-queue tab with a render in flight — this
   * method trusts that guard, it does not re-check.
   */
  public discardTab(tabId: number): DiscardedTab | undefined {
    const tab = this.tabs.get(tabId);
    if (!tab || !(tab instanceof Tab)) return undefined;

    // Remove from the index before destroy(), so a stray event mid-teardown
    // can't resolve back to this tab.
    this.webContentsIndex.delete(tab.webContentsId);

    const discarded: DiscardedTab = {
      discarded: true,
      id: tab.id,
      title: tab.title,
      url: tab.url ?? tab.getUrl(),
      groupId: tab.groupId,
      // Whatever Window.swapTo last captured while this tab was still
      // visible — captureThumbnail() cannot run on a hidden/detached view,
      // so there is no fresher snapshot to take at discard time.
      thumbnail: tab.thumbnail,
      previewData: tab.previewData,
      editorType: tab.editorType,
      isLibrary: tab.isLibrary,
      pendingUserId: tab.pendingUserId,
    };

    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.destroy();
    }

    // .set() on an existing key updates the value without moving it in
    // iteration order — the tab keeps its exact position in the strip.
    this.tabs.set(tabId, discarded);
    return discarded;
  }

  /**
   * Rebuild the live view for a discarded tab, preserving its logical id
   * (and therefore its position/group) even though the fresh
   * WebContentsView gets a brand-new real webContents id — exactly why tab
   * identity is decoupled from it (see Tab.ts). Attaches nothing and shows
   * nothing; that's Window.setTabFocus's job, mirroring how addTab only
   * attaches hidden and a separate setTabFocus call does the showing.
   */
  public reviveTab(discarded: DiscardedTab): Tab {
    const tab = new Tab(this.windowId);
    tab.id = discarded.id;
    tab.title = discarded.title;
    tab.groupId = discarded.groupId;
    tab.thumbnail = discarded.thumbnail;
    tab.previewData = discarded.previewData;
    if (discarded.editorType) tab.setEditorType(discarded.editorType);
    if (discarded.isLibrary) tab.setIsLibrary(true);

    // Fold a deferred account switch into the initial load instead of the
    // normal live-tab path of loading once and re-navigating a second time
    // (see refreshTabUserId) — there's no "already showing the old account"
    // moment to correct for here, so there's no reason to pay for two loads.
    let url = discarded.url;
    if (discarded.pendingUserId) {
      const parsedUrl = parseURL(url);
      if (parsedUrl) {
        parsedUrl.searchParams.set("fuid", discarded.pendingUserId);
        url = parsedUrl.toString();
      }
    }
    tab.loadUrl(url);

    this.tabs.set(tab.id, tab);
    this.webContentsIndex.set(tab.webContentsId, tab.id);

    if (tab.title === NEW_FILE_TAB_TITLE) {
      this.hasOpenedNewFileTab = true;
    }

    return tab;
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
    const tab = this.getByWebContentsId(webContentsId);

    if (tab) {
      tab.view.webContents.send("handleCallback", callbackID, args);
    }
  }

  public closeAll() {
    for (const tab of this.tabs.values()) {
      if (tab instanceof Tab && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.destroy();
      }
    }
    this.tabs.clear();
    this.webContentsIndex.clear();

    // mainTab and communityTab live outside the map. Leaving them behind was
    // invisible while every window close ended the process; with the tray
    // keeping the app alive each close would leak a full Figma page.
    if (this.communityTab) this.closeCommunityTab();
    if (!this.mainTab.view.webContents.isDestroyed()) {
      this.mainTab.view.webContents.destroy();
    }
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
      const entry = array[i];
      const next = array[i + 1];

      if (!next) {
        break;
      }
      if (entry[0] === tabId) {
        nextTabId = next[0];
        break;
      }

      nextTabId = entry[0];
    }

    if (tab instanceof Tab) {
      this.webContentsIndex.delete(tab.webContentsId);
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.destroy();
      }
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
      if (t instanceof Tab && !t.view.webContents.isDestroyed()) {
        t.view.webContents.reload();
      }
    });
  }
  public updateScaleAll(scale: number) {
    this.mainTab.updateScale(scale);
    if (this.communityTab) this.communityTab.updateScale(scale);
    this.tabs.forEach((t) => {
      if (t instanceof Tab) t.updateScale(scale);
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
    let foundTab: Tab | DiscardedTab | undefined;

    this.tabs.forEach((tab) => {
      if (index === i) {
        foundTab = tab;
      }

      i++;
    });

    return foundTab;
  }

  public getTabIndex(webContentsId: number) {
    // NOTE: `return` inside forEach only skips one iteration — it does not stop
    // the walk — so the counter must break out of a real loop instead.
    let i = 0;
    for (const id of this.tabs.keys()) {
      if (webContentsId === id) return i;
      i++;
    }
    return -1;
  }

  public reloadTab(tabId: number) {
    const tab = this.getById(tabId);

    if (tab && !("discarded" in tab)) {
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
  public getById(id: Types.TabIdType): Tab | DiscardedTab | MainTab | CommunityTab | undefined {
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
    let foundTab: Tab | DiscardedTab | undefined;

    this.tabs.forEach((tab) => {
      if (tab.title === title) {
        foundTab = tab;
      }
    });

    return foundTab;
  }
  public getByPath(path: string) {
    let foundTab: Tab | DiscardedTab | undefined;

    this.tabs.forEach((tab) => {
      const liveUrl = tab instanceof Tab ? (tab.url ?? tab.getUrl()) : tab.url;
      const pathname = parseURL(liveUrl)?.pathname;
      if (!pathname) return;
      // Plain substring match — the pathname is user data, not a pattern.
      if (path.includes(pathname)) {
        foundTab = tab;
      }
    });

    return foundTab;
  }
  public getAll = () => this.tabs;

  /** Direct map lookup — avoids the getById() fallback-to-mainTab footgun for a dynamic id. */
  public setGroupId(tabId: number, groupId: string | undefined) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.groupId = groupId;
  }

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

    if (tab && !("discarded" in tab)) {
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
    if (active && active !== this.mainTab && !("discarded" in active)) {
      active.setBounds(bounds);
    }
  }

  public setBoundsForAllTab(bounds: Rectangle) {
    this.mainTab.setBounds(bounds);

    if (this.hasOpenedCommunityTab) {
      this.communityTab.setBounds(bounds);
    }

    for (const [_, tab] of this.tabs) {
      if (!("discarded" in tab)) tab.setBounds(bounds);
    }
  }
  public sortTabs(tabs: Types.TabFront[]) {
    const entries = [...this.tabs.entries()];
    const next = new Map<number, Tab | DiscardedTab>();
    const placed = new Set<number>();

    // Apply the requested order for ids we actually have.
    for (const tab of tabs) {
      const entry = entries.find(([key]) => key === tab.id);
      if (entry && !placed.has(entry[0])) {
        next.set(entry[0], entry[1]);
        placed.add(entry[0]);
      }
    }
    // Preserve any existing tabs the payload didn't mention — never drop a tab.
    for (const [key, tab] of entries) {
      if (!placed.has(key)) {
        next.set(key, tab);
      }
    }

    this.tabs = next;
  }

  public getTabUrl(tabId: number) {
    const tab = this.tabs.get(tabId);
    if (!tab) return undefined;

    return tab instanceof Tab ? tab.view.webContents.getURL() : tab.url;
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

    if (tab && !("discarded" in tab)) {
      tab.view.webContents.send("handlePluginMenuAction", pluginMenuAction);
    }
  }

  public getActiveTabPath(): string {
    const tab = this.getById(this.lastFocusedTab);
    if (!tab || "discarded" in tab) return "";
    const tabUri = tab.view.webContents.getURL();

    return parseURL(tabUri)?.pathname ?? "";
  }

  private registerEvents() {}
}
