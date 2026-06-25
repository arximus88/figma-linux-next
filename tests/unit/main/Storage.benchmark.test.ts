import { mock, test, expect } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const tempUserData = path.join(
  os.tmpdir(),
  `figma-linux-test-${Math.random().toString(36).substring(7)}`,
);
if (!fs.existsSync(tempUserData)) {
  fs.mkdirSync(tempUserData);
}

// Mock electron-log before it requires electron at module level
mock.module("electron-log/main", () => ({
  default: { transports: {}, initialize: () => {} },
}));

// Mock ALL potential imports before they are touched (include all named exports transitive deps import)
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

mock.module("./Logger", () => ({
  logger: {
    error: () => {},
    warn: () => {},
    info: () => {},
    initialize: () => {},
  },
}));

// Mock Utils/Main to avoid path resolution issues if node_modules is missing
mock.module("Utils/Main", () => {
  const DEFAULT_SETTINGS = {
    clientId: "test-client-id",
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
    accessSync: (p: string) => fs.existsSync(p),
    access: async (p: string) => fs.existsSync(p),
  };
});

import { Storage } from "Main/Storage";

test("Storage Initialization Benchmark", async () => {
  console.log("--- Storage Initialization Benchmark ---");

  const iterations = 100;

  // Test 1: Cold start (no file)
  const startCold = performance.now();
  for (let i = 0; i < iterations; i++) {
    const storage = new Storage();
    await storage.initialize();
    const filePath = path.join(tempUserData, "settings.json");
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  const endCold = performance.now();
  console.log(`Cold start (no file) average: ${((endCold - startCold) / iterations).toFixed(4)}ms`);

  // Test 2: Warm start (file exists)
  const storageSetup = new Storage();
  await storageSetup.initialize();

  const startWarm = performance.now();
  for (let i = 0; i < iterations; i++) {
    const storage = new Storage();
    await storage.initialize();
  }
  const endWarm = performance.now();
  console.log(
    `Warm start (file exists) average: ${((endWarm - startWarm) / iterations).toFixed(4)}ms`,
  );

  // Clean up
  fs.rmSync(tempUserData, { recursive: true, force: true });
  expect(true).toBe(true);
});
