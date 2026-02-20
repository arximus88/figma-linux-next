import { bridgePreloadPathDev, bridgePreloadPathProd, isDev } from "Utils/Main";

export const WINDOW_DEFAULT_OPTIONS: Types.WindowState & {
  frame: boolean;
  webPreferences: Electron.WebPreferences;
} = {
  x: -1,
  y: -1,
  width: 1200,
  height: 900,
  isMaximized: false,
  lastActiveTabPath: "",
  hasOpenedCommunityTab: false,
  userId: "",
  tabs: [],
  frame: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: isDev ? bridgePreloadPathDev : bridgePreloadPathProd,
  },
};
