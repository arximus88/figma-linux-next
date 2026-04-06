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
  dialog: {
    showMessageBoxSync: () => {},
    showOpenDialogSync: () => {},
    showMessageBox: () => {},
    showOpenDialog: () => {},
    showSaveDialog: () => {},
    showSaveDialogSync: () => {},
  },
  shell: { openExternal: () => {}, showItemInFolder: () => {} },
  clipboard: {},
  nativeImage: { createFromPath: () => ({}) },
  Menu: class {
    static buildFromTemplate = () => ({ popup: () => {} });
    setApplicationMenu = () => {};
  },
  MenuItem: class {},
  Tray: class {
    setToolTip = () => {};
    setContextMenu = () => {};
  },
  Notification: class {
    show = () => {};
  },
  BrowserWindow: class {
    static getAllWindows = (): never[] => [];
    id = 1;
    webContents = {
      id: 2,
      send: () => {},
      on: () => {},
      once: () => {},
      getURL: () => "http://figma.com",
    };
    contentView = { addChildView: () => {}, removeChildView: () => {} };
    loadURL = () => {};
    getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
    getContentBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
    isMaximized = () => false;
    isFullScreen = () => false;
    maximize = () => {};
    focus = () => {};
    on = () => {};
    close = () => {};
    setMenu = () => {};
  },
  WebContentsView: class {
    webContents = {
      id: Math.random(),
      send: () => {},
      isDestroyed: () => false,
      destroy: () => {},
      getURL: () => "https://figma.com",
      executeJavaScript: () => {},
      setWindowOpenHandler: () => {},
    };
    setBackgroundColor = () => {};
    setBounds = () => {};
  },
  BrowserView: class {},
  MessageChannelMain: class {},
  globalShortcut: {},
  screen: {},
  nativeTheme: {},
  systemPreferences: {},
  crashReporter: {},
  powerMonitor: {},
  powerSaveBlocker: {},
  desktopCapturer: {},
  ShareMenu: class {},
  TouchBar: class {},
  autoUpdater: {},
  contentTracing: {},
  inAppPurchase: {},
  safeStorage: {},
  Rectangle: {},
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
