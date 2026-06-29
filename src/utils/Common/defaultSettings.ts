import { LogLevel } from "Types/enums";

/**
 * Environment-independent default settings shared by the main and renderer
 * process default-settings modules. Anything that needs a Node runtime
 * (a random clientId, `$HOME`-derived paths) is overridden in
 * `Utils/Main/defaultSettings`; the renderer re-exports this object verbatim
 * as its placeholder shape (real values arrive via the `getSettings` IPC).
 *
 * Keep this as the single source of truth for every env-independent field so
 * the two process-specific copies cannot drift.
 */
export const BASE_DEFAULT_SETTINGS: Types.SettingsInterface = {
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
