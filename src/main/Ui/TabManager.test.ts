import { describe, expect, it, beforeEach, mock } from "bun:test";

import "../../test/electron-preload";

mock.module("electron", () => {
  let counter = 1;
  class MockWebContentsView {
    webContents = {
      id: counter++,
      on: () => {},
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
        }
      }
    };
    setBackgroundColor() {}
    setBounds() {}
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
    BrowserWindow: class {},
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

import TabManager from "./TabManager";
import MainTab from "./MainTab";
import CommunityTab from "./CommunityTab";
import Tab from "./Tab";

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
});
