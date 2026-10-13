import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// Mock dependencies before anything else
mock.module("electron-log/main", () => ({
  default: { initialize: mock(), error: mock(), warn: mock(), info: mock(), debug: mock() },
}));

mock.module("Main/Logger", () => ({
  logger: { error: mock(), warn: mock(), info: mock(), debug: mock() },
}));

mock.module("Main/Storage", () => ({
  storage: {
    settings: {
      app: { recentlyClosedTabs: [], figmaTheme: "dark" },
    },
  },
}));

mock.module("Main/Theme", () => ({
  refreshSystemTheme: mock(() => Promise.resolve(false)),
  getResolvedFigmaTheme: mock(() => "dark"),
  isFigmaThemePreference: mock(() => true),
}));

mock.module("./MenuManager", () => ({
  default: class {
    getMenu = mock();
  },
}));

mock.module("electron", () => ({
  app: {
    getPath: () => "/tmp",
    emit: mock(),
    getVersion: () => "0.0.0",
    getName: () => "test",
    on: mock(),
    getAppMetrics: mock(() => []),
  },
  nativeTheme: { on: mock(), shouldUseDarkColors: false },
  clipboard: { readText: mock(), writeText: mock() },
  ipcMain: { on: mock(), handle: mock(), removeHandler: mock() },
}));

import { app } from "electron";
import { storage } from "Main/Storage";
import WindowManager from "Main/Ui/WindowManager";

describe("WindowManager.setUserIdOnAllWindows", () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    windowManager = new WindowManager();
  });

  test("calls setUserId on every registered window, not just the first or last", () => {
    const windows = (windowManager as any).windows as Map<number, any>;

    const windowA = { setUserId: mock() };
    const windowB = { setUserId: mock() };
    const windowC = { setUserId: mock() };
    windows.set(1, windowA);
    windows.set(2, windowB);
    windows.set(3, windowC);

    windowManager.setUserIdOnAllWindows("user-42");

    expect(windowA.setUserId).toHaveBeenCalledWith("user-42", undefined);
    expect(windowB.setUserId).toHaveBeenCalledWith("user-42", undefined);
    expect(windowC.setUserId).toHaveBeenCalledWith("user-42", undefined);
  });

  test("passes the source webContents on so its tab is not reloaded a second time", () => {
    const windows = (windowManager as any).windows as Map<number, any>;
    const windowA = { setUserId: mock() };
    windows.set(1, windowA);

    windowManager.setUserIdOnAllWindows("user-42", 77);

    expect(windowA.setUserId).toHaveBeenCalledWith("user-42", 77);
  });
});

describe("background memory budget", () => {
  let manager: any;
  let discarded: number[];
  beforeEach(() => {
    storage.settings.app.autoDiscardTabs = false;
    manager = new WindowManager();
    storage.settings.app.autoDiscardTabs = true;
    storage.settings.app.discardMemoryBudgetMB = 1024;
    discarded = [];
  });
  afterEach(() => {
    storage.settings.app.autoDiscardTabs = false;
    manager.ensureMemoryCheckInterval();
  });
  function windowWithTabs(id: number, tabs: [number, number][], protectedIds: number[] = []) {
    const live = new Map(
      tabs.map(([tabId, pid]) => [
        tabId,
        {
          id: tabId,
          view: { webContents: { isDestroyed: () => false, getOSProcessId: () => pid } },
        },
      ]),
    );
    manager.windows.set(id, {
      tabs: live,
      getBackgroundLiveTabs: () => [...live.values()],
      discardTab: (tabId: number) => {
        if (protectedIds.includes(tabId)) return false;
        discarded.push(tabId);
        return live.delete(tabId);
      },
    });
  }
  function metrics(entries: [number, number][]) {
    (app.getAppMetrics as any).mockReturnValue(
      entries.map(([pid, mb]) => ({ pid, memory: { workingSetSize: mb * 1024 } })),
    );
  }
  test("discards least recently focused tabs across windows until within budget", () => {
    windowWithTabs(1, [
      [1, 101],
      [2, 102],
    ]);
    windowWithTabs(2, [[3, 103]]);
    manager.tabMru = new Map([
      [2, 1],
      [3, 2],
      [1, 1],
    ]);
    metrics([
      [101, 600],
      [102, 600],
      [103, 600],
    ]);
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([2, 3]);
  });
  test("a refused discard does not reduce the measured memory", () => {
    windowWithTabs(
      1,
      [
        [1, 101],
        [2, 102],
        [3, 103],
      ],
      [1],
    );
    manager.tabMru = new Map([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    metrics([
      [101, 600],
      [102, 600],
      [103, 600],
    ]);
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([2, 3]);
  });
  test("shared renderer memory is counted once", () => {
    windowWithTabs(1, [
      [1, 101],
      [2, 101],
    ]);
    metrics([[101, 800]]);
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([]);
  });
  test("shared renderer memory is released only after both tabs discard", () => {
    windowWithTabs(1, [
      [1, 101],
      [2, 101],
      [3, 103],
    ]);
    metrics([
      [101, 1200],
      [103, 500],
    ]);
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([1, 2]);
  });
  test("tabs with no memory sample are not discarded speculatively", () => {
    windowWithTabs(1, [
      [1, 101],
      [2, 102],
    ]);
    metrics([[102, 1200]]);
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([2]);
  });
  test("disabled control leaves tabs loaded", () => {
    windowWithTabs(1, [[1, 101]]);
    metrics([[101, 1200]]);
    storage.settings.app.autoDiscardTabs = false;
    manager.enforceMemoryBudget();
    expect(discarded).toEqual([]);
  });
});
