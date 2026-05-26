import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test";

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
      id = 1;
      webContents = {
        id: 2,
        send: mock(),
        on: mock(),
        once: mock(),
        getURL: () => "http://figma.com",
      };
      contentView = { addChildView: mock(), removeChildView: mock() };
      loadURL = mock();
      getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
      getContentBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
      isMaximized = () => false;
      isFullScreen = () => false;
      maximize = mock();
      focus = mock();
      on = mock();
      close = mock();
      setMenu = mock();
      setBounds = mock();
    },
    WebContentsView: class {
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

import { IpcMainEvent } from "electron";
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
});
