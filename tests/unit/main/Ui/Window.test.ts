import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test";

// Mock dependencies before anything else
mock.module("electron-log/main", () => ({
  default: { initialize: mock(), error: mock(), warn: mock(), info: mock(), debug: mock() },
}));

mock.module("../Logger", () => ({
  logger: { error: mock(), warn: mock(), info: mock(), debug: mock() },
}));

mock.module("Main/Storage", () => ({
  storage: {
    settings: {
      app: { panelHeight: 40, saveLastOpenedTabs: false, figmaTheme: "dark" },
      ui: { scalePanel: 1 },
    },
  },
}));

mock.module("Main/Dialogs", () => ({
  dialogs: { showMessageBoxSync: mock() },
}));

mock.module("./SettingsView", () => ({
  default: class {
    view = { webContents: { id: 500 } };
    updateProps = mock();
    closeDevTools = mock();
    postClose = mock();
    destroy = mock();
  },
}));

// Provide a mock that includes the exact exports used by the dependency tree
mock.module("electron", () => {
  return {
    app: {
      getPath: () => "/tmp",
      emit: mock(),
      getVersion: () => "0.0.0",
      getName: () => "test",
      on: mock(),
    },
    net: { request: mock() },
    session: { defaultSession: { webRequest: { onHeadersReceived: mock() } } },
    protocol: { registerSchemesAsPrivileged: mock() },
    ipcMain: { on: mock(), handle: mock(), removeHandler: mock() },
    dialog: { showMessageBoxSync: mock(), showOpenDialogSync: mock() },
    BrowserWindow: class {
      static fromId = (): undefined => undefined;
      id = 1;
      webContents = {
        id: 2,
        send: mock(),
        on: mock(),
        once: mock(),
        getURL: () => "http://figma.com",
      };
      contentView = { addChildView: mock(), removeChildView: mock(), children: [] as unknown[] };
      loadURL = mock();
      getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
      getContentBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
      isMaximized = () => false;
      isFullScreen = () => false;
      isDestroyed = () => false;
      isVisible = () => true;
      show = mock();
      hide = mock();
      maximize = mock();
      focus = mock();
      on = mock();
      close = mock();
      setMenu = mock();
      setBounds = mock();
    },
    WebContentsView: class {
      setVisible = mock();
      getVisible = () => true;
      webContents = {
        id: Math.random(),
        send: mock(),
        isDestroyed: () => false,
        destroy: mock(),
        getURL: () => "https://figma.com",
        executeJavaScript: mock(),
        setWindowOpenHandler: mock(),
        loadURL: mock(),
        on: mock(),
        once: mock(),
        session: {
          webRequest: {
            onHeadersReceived: mock(),
            onBeforeSendHeaders: mock(),
          },
          setPermissionRequestHandler: mock(),
          setDevicePermissionHandler: mock(),
        },
      };
      setBackgroundColor = mock();
      setBounds = mock();
    },
    Menu: class {},
  };
});

import type { IpcMainEvent } from "electron";
import { storage } from "Main/Storage";
import Tab from "Main/Ui/Tab";
import Window from "Main/Ui/Window";

describe("Window Tab Routing", () => {
  let windowInstance: Window;
  let mockEvent: IpcMainEvent;

  beforeEach(() => {
    windowInstance = new Window({} as any);
    windowInstance.setUserId("test-user");
    mockEvent = {
      sender: { id: 999 },
      reply: mock(),
    } as unknown as IpcMainEvent;
  });

  describe("Bug 1: Team switch opened an infinite-loading new tab", () => {
    test("openFile called with a team URL from mainTab navigates mainTab, no new tab created", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const mainTabWebContentsId = tabManager.mainTabWebContentId;
      (mockEvent.sender as any).id = mainTabWebContentsId;

      const addTabSpy = spyOn(windowInstance, "addTab").mockReturnValue({ id: 999 } as any);
      const loadUrlMainTabSpy = spyOn(windowInstance, "loadUrlMainTab");

      windowInstance.openFile(mockEvent, "/files/team/1234");

      expect(addTabSpy).not.toHaveBeenCalled();
      expect(loadUrlMainTabSpy).toHaveBeenCalled();
    });

    test("openFile called with a design URL from mainTab opens a new tab (not in home tab)", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const mainTabWebContentsId = tabManager.mainTabWebContentId;
      (mockEvent.sender as any).id = mainTabWebContentsId;

      const addTabSpy = spyOn(windowInstance, "addTab").mockReturnValue({ id: 999 } as any);
      const loadUrlMainTabSpy = spyOn(windowInstance, "loadUrlMainTab");

      windowInstance.openFile(mockEvent, "/design/abc123/My-File");

      expect(loadUrlMainTabSpy).not.toHaveBeenCalled();
      expect(addTabSpy).toHaveBeenCalled();
    });

    test("openFile called from regular tab -> new tab opens as before", () => {
      (mockEvent.sender as any).id = 12345; // Regular tab ID
      const addTabSpy = spyOn(windowInstance, "addTab").mockReturnValue({ id: 999 } as any);
      windowInstance.openFile(mockEvent, "/files/abc/1234");
      expect(addTabSpy).toHaveBeenCalled();
    });
  });

  describe("Bug 2: New File tab remained open after opening an existing file", () => {
    test("After openFile resolves when a New File tab is open -> New File tab is closed", () => {
      const closeNewFileTabSpy = spyOn(windowInstance, "closeNewFileTab");

      // Make it appear like a New File tab is open
      const tabManager: any = (windowInstance as any).tabManager;
      spyOn(tabManager, "isNewFileTab").mockReturnValue(true);

      // Mock addTab to avoid errors
      spyOn(windowInstance, "addTab").mockReturnValue({ id: 999 } as any);

      windowInstance.openFile(mockEvent, "/files/abc/1234");

      // Notice: `Window.ts` openFile uses `this.tabManager.loadUrlInMainTab(normalizedUrl)` when `isAppAuthRedeem`.
      // The requirement says:
      // "After openFile resolves when a New File tab is open -> New File tab is closed"
      expect(closeNewFileTabSpy).toHaveBeenCalled();
    });

    test("After openFile resolves when NO New File tab is open -> no crash, no mainTab removal", () => {
      const closeNewFileTabSpy = spyOn(windowInstance, "closeNewFileTab");

      // Make it appear like NO New File tab is open
      const tabManager: any = (windowInstance as any).tabManager;
      spyOn(tabManager, "isNewFileTab").mockReturnValue(false);

      // Add spy to closeTab
      const closeTabSpy = spyOn(windowInstance, "closeTab");
      spyOn(windowInstance, "addTab").mockReturnValue({ id: 999 } as any);

      windowInstance.openFile(mockEvent, "/files/abc/1234");

      // closeNewFileTab is called unconditionally, but since it returns early when there is no new file tab, that is expected.
      expect(closeNewFileTabSpy).toHaveBeenCalled();
      expect(closeTabSpy).not.toHaveBeenCalledWith(tabManager.mainTabWebContentId);
    });

    test("createFile still closes the New File tab (existing behavior, explicit assertion)", () => {
      const closeTabSpy = spyOn(windowInstance, "closeTab");
      spyOn(windowInstance, "addTab").mockReturnValue({
        id: 999,
        loadUrl: mock(),
      } as any);

      const tabManager: any = (windowInstance as any).tabManager;
      spyOn(tabManager, "getByTitle").mockReturnValue({ id: 123 }); // ID of the New File tab

      windowInstance.createFile({ url: "/files/new" } as any);

      expect(closeTabSpy).toHaveBeenCalledWith(123); // Closes the new file tab
    });
  });

  describe("Bug 3: saveLastOpenedTabs persisted empty tabs after closeAll", () => {
    test("getState returns cached snapshot after cacheStateBeforeClose, even when live tabs map has been cleared", () => {
      const tabManager: any = (windowInstance as any).tabManager;

      // Seed live tabs the same way TabManager would
      tabManager.tabs.set(101, { title: "File A", url: "https://www.figma.com/design/abc/A" });
      tabManager.tabs.set(102, { title: "File B", url: "https://www.figma.com/design/def/B" });

      // Snapshot state before tabManager.closeAll() clears the map (mimics Window.close())
      (windowInstance as any).cacheStateBeforeClose();

      // Simulate closeAll wiping the live tabs map
      tabManager.tabs.clear();

      // getState must return the cached snapshot, not an empty list — otherwise
      // WindowManager.saveState() would persist windowsState[id].tabs:[] and the
      // next launch would start with a fresh session.
      const state = windowInstance.getState();
      expect(state.tabs.length).toBe(2);
      expect(state.tabs[0].url).toBe("https://www.figma.com/design/abc/A");
      expect(state.tabs[1].url).toBe("https://www.figma.com/design/def/B");
    });
  });

  describe("Tab groups (Phase 1: metadata + membership, no drag-and-drop)", () => {
    test("createTabGroupWithTab assigns the tab and broadcasts the new group", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://figma.com/file/abc", "File A");
      const send: any = windowInstance.win.webContents.send;
      send.mockClear();

      windowInstance.createTabGroupWithTab(tab.id, "  Design  ", "#4285f4");

      const groups = windowInstance.getTabGroups();
      expect(groups.length).toBe(1);
      expect(groups[0].label).toBe("Design"); // trimmed
      expect(groups[0].color).toBe("#4285f4");
      expect(groups[0].collapsed).toBe(false);
      expect(tab.groupId).toBe(groups[0].id);

      const setTabGroupCall = send.mock.calls.find((c: any[]) => c[0] === "setTabGroup");
      expect(setTabGroupCall?.[1]).toEqual({ id: tab.id, groupId: groups[0].id });
      expect(send.mock.calls.some((c: any[]) => c[0] === "tabGroupsChanged")).toBe(true);
    });

    test("createTabGroupWithTab ignores a blank label", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://figma.com/file/abc", "File A");

      windowInstance.createTabGroupWithTab(tab.id, "   ", "#4285f4");

      expect(windowInstance.getTabGroups().length).toBe(0);
      expect(tab.groupId).toBeUndefined();
    });

    test("addTabToGroup moves a tab into another group and prunes the one it left empty", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tabA = tabManager.addTab("https://figma.com/file/a", "A");
      const tabB = tabManager.addTab("https://figma.com/file/b", "B");

      windowInstance.createTabGroupWithTab(tabA.id, "Group A", "#4285f4");
      const groupAId = windowInstance.getTabGroups()[0].id;
      windowInstance.createTabGroupWithTab(tabB.id, "Group B", "#ea4335");
      const groupBId = windowInstance.getTabGroups().find((g) => g.id !== groupAId)!.id;

      windowInstance.addTabToGroup(tabA.id, groupBId);

      expect(tabA.groupId).toBe(groupBId);
      const groups = windowInstance.getTabGroups();
      expect(groups.length).toBe(1);
      expect(groups[0].id).toBe(groupBId);
    });

    test("removeTabFromGroup clears membership and deletes a now-empty group", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://figma.com/file/a", "A");
      windowInstance.createTabGroupWithTab(tab.id, "Design", "#4285f4");

      windowInstance.removeTabFromGroup(tab.id);

      expect(tab.groupId).toBeUndefined();
      expect(windowInstance.getTabGroups().length).toBe(0);
    });

    test("removeTabFromGroup keeps the group while another tab is still a member", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tabA = tabManager.addTab("https://figma.com/file/a", "A");
      const tabB = tabManager.addTab("https://figma.com/file/b", "B");
      windowInstance.createTabGroupWithTab(tabA.id, "Design", "#4285f4");
      const groupId = windowInstance.getTabGroups()[0].id;
      windowInstance.addTabToGroup(tabB.id, groupId);

      windowInstance.removeTabFromGroup(tabA.id);

      expect(tabA.groupId).toBeUndefined();
      expect(windowInstance.getTabGroups().length).toBe(1);
      expect(tabB.groupId).toBe(groupId);
    });

    test("setTabGroupCollapsed toggles the group's collapsed flag", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://figma.com/file/a", "A");
      windowInstance.createTabGroupWithTab(tab.id, "Design", "#4285f4");
      const groupId = windowInstance.getTabGroups()[0].id;

      windowInstance.setTabGroupCollapsed(groupId, true);
      expect(windowInstance.getTabGroups()[0].collapsed).toBe(true);

      windowInstance.setTabGroupCollapsed(groupId, false);
      expect(windowInstance.getTabGroups()[0].collapsed).toBe(false);
    });

    test("closing a group's last tab prunes the group", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://figma.com/file/a", "A");
      windowInstance.createTabGroupWithTab(tab.id, "Design", "#4285f4");

      windowInstance.closeTab(tab.id);

      expect(windowInstance.getTabGroups().length).toBe(0);
    });

    test("getState persists each tab's groupId alongside the group metadata", () => {
      const tabManager: any = (windowInstance as any).tabManager;
      const tab = tabManager.addTab("https://www.figma.com/design/abc/A", "File A");
      windowInstance.createTabGroupWithTab(tab.id, "Design", "#4285f4");

      const state = windowInstance.getState();

      expect(state.tabs[0].groupId).toBe(state.tabGroups[0].id);
      expect(state.tabGroups[0]).toEqual({
        id: state.tabGroups[0].id,
        label: "Design",
        color: "#4285f4",
        collapsed: false,
        order: 0,
      });
    });

    test("applyState pre-populates groups from persisted state, and restoreTabs restores groupId", () => {
      const originalSaveTabs = storage.settings.app.saveLastOpenedTabs;
      storage.settings.app.saveLastOpenedTabs = true;

      try {
        const persisted: any = {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          isMaximized: false,
          lastActiveTabPath: "",
          hasOpenedCommunityTab: false,
          userId: "",
          tabs: [],
          tabGroups: [{ id: "g1", label: "Design", color: "#4285f4", collapsed: false, order: 0 }],
        };

        const restored = new Window(persisted);

        // applyState() runs synchronously in the constructor.
        expect(restored.getTabGroups()).toEqual([
          { id: "g1", label: "Design", color: "#4285f4", collapsed: false, order: 0 },
        ]);

        const scheduled: Array<() => void> = [];
        const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
          fn: () => void,
        ) => {
          scheduled.push(fn);
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);
        const addTabSpy = spyOn(restored, "addTab").mockReturnValue({ id: 1 } as any);

        restored.restoreTabs([
          { title: "File A", url: "https://www.figma.com/design/abc/A", groupId: "g1" },
        ]);
        while (scheduled.length) scheduled.shift()!();

        expect(addTabSpy).toHaveBeenCalledWith(
          "https://www.figma.com/design/abc/A",
          "File A",
          "g1",
        );

        setTimeoutSpy.mockRestore();
      } finally {
        storage.settings.app.saveLastOpenedTabs = originalSaveTabs;
      }
    });
  });
});

/**
 * Characterization tests for the warm-tab state machine (TTL / bootstrap /
 * promotion). Written BEFORE extracting WarmTabManager so the extraction is
 * verified behaviorally.
 *
 * Seams are deliberately behavior-level and stable across the extraction:
 *   - `setTimeout` is spied to capture/flush the scheduler (the warm scheduler
 *     calls `setTimeout(fn, delay)` whether it lives on Window or WarmTabManager).
 *   - `Tab.prototype.loadUrl` is spied to capture the warm Tab instance created
 *     by initWarmTab (still `new Tab(...); tab.loadUrl(...)` after extraction).
 * Assertions are on public methods + injected collaborators (tabManager,
 * window.webContents.send), never on private warm-tab fields.
 */
describe("Warm tab lifecycle", () => {
  let w: Window;
  let scheduled: Array<{ fn: () => void; delay: number }>;
  let setTimeoutSpy: any;
  let loadUrlSpy: any;
  let lastWarmTab: any;

  /** Find the args of the most recent send(channel, ...) call, or undefined. */
  function lastSend(send: any, channel: string): any[] | undefined {
    const calls = send.mock.calls.filter((c: any[]) => c[0] === channel);
    return calls.length ? calls[calls.length - 1] : undefined;
  }

  beforeEach(() => {
    scheduled = [];
    setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      delay: number,
    ) => {
      scheduled.push({ fn, delay });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    lastWarmTab = undefined;
    loadUrlSpy = spyOn(Tab.prototype, "loadUrl").mockImplementation(function (this: any) {
      lastWarmTab = this;
    });

    w = new Window({} as any);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    loadUrlSpy.mockRestore();
  });

  /** Fire every currently-scheduled timer callback once (nested schedules queue). */
  function flushTimers() {
    const snapshot = scheduled.slice();
    scheduled.length = 0;
    for (const t of snapshot) t.fn();
  }

  test("first setUserId schedules a warm tab (2000ms)", () => {
    w.setUserId("user-1");
    expect(scheduled.some((t) => t.delay === 2000)).toBe(true);
  });

  test("does not double-schedule while one is already pending", () => {
    w.setUserId("user-1");
    const countAfterFirst = scheduled.length;
    // A re-entrant setUserId (e.g. the warm tab's own setUser cascade) must not
    // queue a second warm tab while one is scheduled.
    w.setUserId("user-1");
    expect(scheduled.length).toBe(countAfterFirst);
  });

  test("newProject promotes the warm tab instead of creating one", () => {
    w.setUserId("user-1");
    flushTimers(); // initWarmTab → warm tab created (captured in lastWarmTab)
    expect(lastWarmTab).toBeDefined();

    const tabManager: any = (w as any).tabManager;
    const promoteSpy = spyOn(tabManager, "promoteWarmTab");
    const addTabSpy = spyOn(w, "addTab");
    spyOn(w, "setTabFocus").mockReturnValue(undefined as any);
    const send: any = w.win.webContents.send;

    w.newProject();

    expect(promoteSpy.mock.calls.length).toBe(1);
    expect(addTabSpy).not.toHaveBeenCalled();
    expect(lastSend(send, "didTabAdd")?.[1]?.loading).toBe(true);
    // Next warm tab warmed for next time
    expect(scheduled.some((t) => t.delay === 100)).toBe(true);
  });

  test("promotion clears the skeleton flag once the warm tab has bootstrapped", () => {
    w.setUserId("user-1");
    flushTimers();
    const warmId = lastWarmTab.id;

    // Warm tab signals readiness via setLoading(false) from its own webContents.
    w.setLoading({ sender: { id: warmId } } as any, { loading: false } as any);

    const tabManager: any = (w as any).tabManager;
    spyOn(tabManager, "promoteWarmTab");
    spyOn(w, "setTabFocus").mockReturnValue(undefined as any);
    const send: any = w.win.webContents.send;

    w.newProject();

    expect(lastSend(send, "didTabAdd")?.[1]?.loading).toBe(false);
  });

  test("setLoading from the warm tab is swallowed (not forwarded to the panel)", () => {
    w.setUserId("user-1");
    flushTimers();
    const warmId = lastWarmTab.id;
    const send: any = w.win.webContents.send;
    send.mockClear?.();

    w.setLoading({ sender: { id: warmId } } as any, { loading: true } as any);

    const forwarded = send.mock.calls.some((c: any[]) => c[0] === "setLoading" && c[1] === warmId);
    expect(forwarded).toBe(false);
  });

  test("newProject falls back to addTab when no warm tab is ready", () => {
    w.setUserId("user-1"); // scheduled but NOT flushed → no warm tab yet
    const tabManager: any = (w as any).tabManager;
    const promoteSpy = spyOn(tabManager, "promoteWarmTab");
    const addTabSpy = spyOn(w, "addTab").mockReturnValue({ id: 1 } as any);

    w.newProject();

    expect(addTabSpy).toHaveBeenCalled();
    expect(promoteSpy).not.toHaveBeenCalled();
  });

  test("newProject is a no-op when a New File tab is already open", () => {
    w.setUserId("user-1");
    flushTimers();
    const tabManager: any = (w as any).tabManager;
    tabManager.hasOpenedNewFileTab = true;
    const promoteSpy = spyOn(tabManager, "promoteWarmTab");
    const addTabSpy = spyOn(w, "addTab");

    w.newProject();

    expect(promoteSpy).not.toHaveBeenCalled();
    expect(addTabSpy).not.toHaveBeenCalled();
  });

  test("switching user tears down the stale warm tab and reschedules", () => {
    w.setUserId("user-1");
    flushTimers(); // warm tab for user-1 created
    const staleWarm = lastWarmTab;
    const destroySpy = spyOn(staleWarm.view.webContents, "destroy");

    w.setUserId("user-2");

    // Stale warm tab destroyed and a fresh schedule queued for the new user.
    expect(destroySpy).toHaveBeenCalled();
    expect(scheduled.some((t) => t.delay === 2000)).toBe(true);
  });
});
