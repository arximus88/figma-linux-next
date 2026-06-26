import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const tempUserData = path.join(
  os.tmpdir(),
  `figma-linux-test-${Math.random().toString(36).substring(7)}`,
);

// Mock electron app (include all named exports that transitive deps import)
mock.module("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return tempUserData;
      return os.tmpdir();
    },
  },
  net: {},
  session: {},
  protocol: {},
  ipcMain: { on: () => {}, handle: () => {}, removeHandler: () => {} },
}));

// Mock electron-log before it requires electron at module level
mock.module("electron-log/main", () => ({
  default: { transports: {}, initialize: () => {} },
}));

// Mock logger
mock.module("./Logger", () => ({
  logger: {
    error: () => {},
    warn: () => {},
    info: () => {},
    initialize: () => {},
  },
}));

// Mock Utils/Main to provide the async access and DEFAULT_SETTINGS
mock.module("Utils/Main", () => {
  const DEFAULT_SETTINGS = {
    clientId: "default-client-id",
    userId: "",
    authedUserIDs: [] as string[],
    app: {
      logLevel: 1,
      lastTimeClearLogFile: 0,
      enableColorSpaceSrgb: false,
      useZenity: false,
      panelHeight: 40,
      saveLastOpenedTabs: true,
      exportDir: "/tmp/Figma",
      commandSwitches: [] as never[],
      fontDirs: [] as string[],
      recentlyClosedTabs: [] as never[],
      windowsState: {},
      lastOpenedTabs: {},
      featureFlags: {},
      frameStyle: "gnome",
      savedExtensions: [] as never[],
      figmaTheme: "dark",
    },
    ui: {
      scalePanel: 1,
      scaleFigmaUI: 1,
    },
  };
  return {
    DEFAULT_SETTINGS,
    access: async (p: string) => {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
  };
});

import { Storage } from "Main/Storage";

describe("Storage", () => {
  beforeEach(() => {
    if (!fs.existsSync(tempUserData)) {
      fs.mkdirSync(tempUserData);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempUserData)) {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    }
  });

  test("should initialize with default settings if file doesn't exist", async () => {
    const storage = new Storage();
    await storage.initialize();

    expect(storage.settings).toBeDefined();
    expect(storage.settings.clientId).toBe("default-client-id");

    // Verify file was created
    const filePath = path.join(tempUserData, "settings.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("should load settings from file if it exists", async () => {
    const filePath = path.join(tempUserData, "settings.json");
    const customSettings = {
      clientId: "custom-client-id",
      userId: "user-123",
      app: {
        panelHeight: 50,
      },
    };

    if (!fs.existsSync(tempUserData)) fs.mkdirSync(tempUserData);
    fs.writeFileSync(filePath, JSON.stringify(customSettings));

    const storage = new Storage();
    await storage.initialize();

    expect(storage.settings.clientId).toBe("custom-client-id");
    expect(storage.settings.userId).toBe("user-123");
    expect(storage.settings.app.panelHeight).toBe(50);
    // Should have merged with defaults
    expect(storage.settings.app.figmaTheme).toBe("dark");
  });

  test("should handle corrupt settings file by falling back to defaults", async () => {
    const filePath = path.join(tempUserData, "settings.json");

    if (!fs.existsSync(tempUserData)) fs.mkdirSync(tempUserData);
    fs.writeFileSync(filePath, "invalid json");

    const storage = new Storage();
    await storage.initialize();

    expect(storage.settings.clientId).toBe("default-client-id");
  });

  test("should save settings correctly", async () => {
    const storage = new Storage();
    await storage.initialize();

    storage.settings.userId = "new-user";
    await storage.save();

    const filePath = path.join(tempUserData, "settings.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const savedSettings = JSON.parse(content);

    expect(savedSettings.userId).toBe("new-user");
  });
});
