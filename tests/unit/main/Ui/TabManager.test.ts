import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";

mock.module("electron", () => {
  let counter = 1;
  class MockWebContentsView {
    webContents = {
      id: counter++,
      on: () => {},
      once: () => {},
      send: () => {},
      loadURL: () => {},
      isDestroyed: () => false,
      getURL: () => "mock-url",
      executeJavaScript: () => Promise.resolve(),
      destroy: () => {},
      reload: () => {},
      setWindowOpenHandler: () => {},
      session: {
        setPermissionRequestHandler: () => {},
        webRequest: {
          onHeadersReceived: () => {},
        },
      },
    };
    setBackgroundColor() {}
    setBounds() {}
    setVisible() {}
  }

  return {
    app: {
      getPath: () => "/tmp/figma-linux-test",
      getVersion: () => "0.0.0",
      getName: () => "figma-linux-next-test",
      on: () => {},
      emit: () => {},
      quit: () => {},
    },
    net: { request: () => ({}) },
    session: { defaultSession: { webRequest: { onHeadersReceived: () => {} } } },
    protocol: { registerSchemesAsPrivileged: () => {} },
    ipcMain: { on: () => {}, handle: () => {}, removeHandler: () => {} },
    BrowserWindow: { fromId: (_id: number): undefined => undefined },
    WebContentsView: MockWebContentsView,
    BrowserView: MockWebContentsView,
    clipboard: {},
    dialog: {},
    Menu: class {},
    MenuItem: class {},
    Tray: class {},
    globalShortcut: {},
    screen: {},
    nativeImage: {},
    nativeTheme: {},
    systemPreferences: {},
    crashReporter: {},
    powerMonitor: {},
    powerSaveBlocker: {},
    desktopCapturer: {},
    MessageChannelMain: class {},
    Notification: class {},
    ShareMenu: class {},
    TouchBar: class {},
    process: {},
    autoUpdater: {},
    contentTracing: {},
    inAppPurchase: {},
    safeStorage: {},
    Rectangle: {},
  };
});

mock.module("Main/Storage", () => ({
  storage: {
    settings: {
      app: {
        figmaTheme: "light",
      },
    },
    save: () => {},
  },
}));

import TabManager from "Main/Ui/TabManager";
import MainTab from "Main/Ui/MainTab";
import CommunityTab from "Main/Ui/CommunityTab";
import Tab from "Main/Ui/Tab";

describe("TabManager", () => {
  let tabManager: TabManager;

  beforeEach(() => {
    tabManager = new TabManager(1);
  });

  describe("getById", () => {
    it("should return mainTab for id 'mainTab'", () => {
      const tab = tabManager.getById("mainTab");
      expect(tab).toBeInstanceOf(MainTab);
      expect(tab).toBe(tabManager.mainTab as any);
    });

    it("should return communityTab for id 'communityTab'", () => {
      tabManager.addCommunityTab();
      const tab = tabManager.getById("communityTab");
      expect(tab).toBeInstanceOf(CommunityTab);
      expect(tab).toBe(tabManager.communityTab as any);
    });

    it("should return communityTab if it exists and matches id", () => {
      tabManager.addCommunityTab();
      const tab = tabManager.getById(tabManager.communityTab.id);
      expect(tab).toBeInstanceOf(CommunityTab);
      expect(tab).toBe(tabManager.communityTab as any);
    });

    it("should return mainTab if id matches mainTab.id", () => {
      const tab = tabManager.getById(tabManager.mainTab.id);
      expect(tab).toBeInstanceOf(MainTab);
      expect(tab).toBe(tabManager.mainTab as any);
    });

    it("should return added tab by its id", () => {
      const newTab = tabManager.addTab("https://test.com", "Test");
      const tab = tabManager.getById(newTab.id);
      expect(tab).toBeInstanceOf(Tab);
      expect(tab).toBe(newTab);
    });

    it("should return undefined for unknown IDs instead of silently falling back to mainTab", () => {
      const tab = tabManager.getById(99999);
      expect(tab).toBeUndefined();
    });
  });

  describe("mainTab property", () => {
    it("should be directly accessible via tabManager.mainTab", () => {
      expect(tabManager.mainTab).toBeDefined();
      expect(tabManager.mainTab).toBeInstanceOf(MainTab);
    });
  });

  describe("reapplyUserId", () => {
    it("refreshes the currently focused tab immediately with the new fuid", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      tabManager.focusTab(tab.id);
      spyOn(tab.view.webContents, "getURL").mockReturnValue(
        "https://www.figma.com/design/abc/A?fuid=user-1",
      );
      const loadUrlSpy = spyOn(tab, "loadUrl");

      tabManager.reapplyUserId("user-2");

      expect(loadUrlSpy).toHaveBeenCalledWith("https://www.figma.com/design/abc/A?fuid=user-2");
      expect(tab.pendingUserId).toBeUndefined();
    });

    it("defers background tabs instead of reloading them immediately", () => {
      const active = tabManager.addTab("https://test.com", "Active");
      const background = tabManager.addTab("https://test.com", "Background");
      tabManager.focusTab(active.id);
      const loadUrlSpy = spyOn(background, "loadUrl");

      tabManager.reapplyUserId("user-2");

      expect(loadUrlSpy).not.toHaveBeenCalled();
      expect(background.pendingUserId).toBe("user-2");
    });

    it("forces a repaint via a visibility toggle once the reload actually lands", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      tabManager.focusTab(tab.id);
      spyOn(tab.view.webContents, "getURL").mockReturnValue("https://www.figma.com/design/abc/A");
      let finishLoad: (() => void) | undefined;
      spyOn(tab.view.webContents, "once").mockImplementation(((event: string, cb: () => void) => {
        if (event === "did-finish-load") finishLoad = cb;
      }) as any);
      const setVisibleSpy = spyOn(tab.view, "setVisible");

      tabManager.reapplyUserId("user-2");
      expect(setVisibleSpy).not.toHaveBeenCalled(); // not yet — waits for the load to land
      finishLoad?.();

      expect(setVisibleSpy.mock.calls).toEqual([[false], [true]]);
    });

    it("skips the repaint toggle if the tab is no longer focused by the time it loads", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      const other = tabManager.addTab("https://test.com", "Other");
      tabManager.focusTab(tab.id);
      spyOn(tab.view.webContents, "getURL").mockReturnValue("https://www.figma.com/design/abc/A");
      let finishLoad: (() => void) | undefined;
      spyOn(tab.view.webContents, "once").mockImplementation(((event: string, cb: () => void) => {
        if (event === "did-finish-load") finishLoad = cb;
      }) as any);
      const setVisibleSpy = spyOn(tab.view, "setVisible");

      tabManager.reapplyUserId("user-2");
      tabManager.focusTab(other.id); // user switched to a different tab before this one finished loading
      finishLoad?.();

      expect(setVisibleSpy).not.toHaveBeenCalled();
    });
  });

  describe("applyPendingUserId", () => {
    it("applies a deferred fuid update and reloads the tab", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      tab.pendingUserId = "user-2";
      spyOn(tab.view.webContents, "getURL").mockReturnValue("https://www.figma.com/design/abc/A");
      const loadUrlSpy = spyOn(tab, "loadUrl");

      tabManager.applyPendingUserId(tab.id);

      expect(loadUrlSpy).toHaveBeenCalledWith("https://www.figma.com/design/abc/A?fuid=user-2");
      expect(tab.pendingUserId).toBeUndefined();
    });

    it("is a no-op when there is no pending update", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      const loadUrlSpy = spyOn(tab, "loadUrl");

      tabManager.applyPendingUserId(tab.id);

      expect(loadUrlSpy).not.toHaveBeenCalled();
    });

    it("skips destroyed tabs", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      tab.pendingUserId = "user-2";
      spyOn(tab.view.webContents, "isDestroyed").mockReturnValue(true);
      const loadUrlSpy = spyOn(tab, "loadUrl");

      tabManager.applyPendingUserId(tab.id);

      expect(loadUrlSpy).not.toHaveBeenCalled();
    });

    it("skips tabs whose current URL cannot be parsed", () => {
      const tab = tabManager.addTab("https://test.com", "A");
      tab.pendingUserId = "user-2";
      spyOn(tab.view.webContents, "getURL").mockReturnValue("not-a-url");
      const loadUrlSpy = spyOn(tab, "loadUrl");

      tabManager.applyPendingUserId(tab.id);

      expect(loadUrlSpy).not.toHaveBeenCalled();
    });
  });
});
