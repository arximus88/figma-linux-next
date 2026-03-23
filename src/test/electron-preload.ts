import { mock } from "bun:test";

mock.module("electron", () => ({
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
  WebContentsView: class {},
}));

mock.module("electron-log/main", () => ({
  default: {
    initialize: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    transports: {
      file: { level: "debug", resolvePathFn: undefined },
      console: { level: "debug" },
    },
  },
}));
