import { LogLevel } from "Types/enums";

export const DEFAULT_SETTINGS: Types.SettingsInterface = {
  clientId: "",
  userId: "",
  authedUserIDs: [],
  app: {
    logLevel: LogLevel.INFO,
    lastTimeClearLogFile: 0,
    enableColorSpaceSrgb: false,
    enableWebGPU: false,
    useZenity: false,
    panelHeight: 40,
    saveLastOpenedTabs: true,
    exportDir: "",
    commandSwitches: [
      { switch: "enable-experimental-canvas-features" },
      // Vulkan switches (use-vulkan, enable-unsafe-webgpu) are managed automatically
      // by App.ts based on session type (Wayland vs X11). Add them here only to
      // force-enable on Wayland.
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
    hideWindowMinMaxButtons: false,
    figmaTheme: "dark" as "dark" | "light",
    lastSeenChangelogVersion: "",
  },
  mcp: {
    enableWriteTools: false,
    cdpEnabled: false,
    remoteDebugPort: 9222,
  },
  ui: {
    scalePanel: 1,
    scaleFigmaUI: 1,
  },
};
