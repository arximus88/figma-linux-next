import { describe, expect, test, mock, beforeEach } from "bun:test";

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
  },
  nativeTheme: { on: mock(), shouldUseDarkColors: false },
  clipboard: { readText: mock(), writeText: mock() },
  ipcMain: { on: mock(), handle: mock(), removeHandler: mock() },
}));

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

    expect(windowA.setUserId).toHaveBeenCalledWith("user-42");
    expect(windowB.setUserId).toHaveBeenCalledWith("user-42");
    expect(windowC.setUserId).toHaveBeenCalledWith("user-42");
  });

  test("is a no-op when there are no windows", () => {
    expect(() => windowManager.setUserIdOnAllWindows("user-1")).not.toThrow();
  });
});
