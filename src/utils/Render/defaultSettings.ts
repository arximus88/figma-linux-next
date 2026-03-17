import { LogLevel } from "Types/enums";

export const DEFAULT_SETTINGS: Types.SettingsInterface = {
  clientId: "",
  userId: "",
  authedUserIDs: [],
  app: {
    logLevel: LogLevel.INFO,
    lastTimeClearLogFile: 0,
    enableColorSpaceSrgb: false,
    useZenity: false,
    panelHeight: 40,
    saveLastOpenedTabs: true,
    exportDir: "",
    commandSwitches: [
      { switch: "enable-gpu-rasterization" },
      // { switch: "enable-unsafe-webgpu" },
      // { switch: "enable-skia-graphite" },
      // { switch: "enable-accelerated-2d-canvas" },
      { switch: "enable-experimental-canvas-features" },
      { switch: "use-vulkan" },
    ],
    fontDirs: [
      "/usr/share/fonts",
      "/usr/local/share/fonts",
      "/run/host/fonts",
      "/run/host/user-fonts",
    ],
    recentlyClosedTabs: [],
    windowsState: {},
    lastOpenedTabs: {},
    featureFlags: {},
    savedExtensions: [],
    frameStyle: "gnome",
    figmaTheme: "dark" as "dark" | "light",
  },
  ui: {
    scalePanel: 1,
    scaleFigmaUI: 1,
  },
};
