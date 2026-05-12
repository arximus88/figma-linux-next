import type { BrowserWindowConstructorOptions } from "electron";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "dev";

const bridgePreloadPath = isDev
  ? resolve(process.cwd(), "dist/renderer", "bridge.js")
  : resolve(__dirname, "..", "renderer", "bridge.js");

export const WINDOW_DEFAULT_OPTIONS: BrowserWindowConstructorOptions = {
  width: 1200,
  height: 900,
  frame: false,
  resizable: true,
  roundedCorners: true,
  show: false,
  webPreferences: {
    sandbox: false,
    zoomFactor: 1,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    webSecurity: false,
    webgl: true,
    experimentalFeatures: true,
    contextIsolation: true,
    preload: bridgePreloadPath,
  },
};
