import { randomUUID } from "crypto";
import { LogLevel } from "Types/enums";

export const DEFAULT_SETTINGS: Types.SettingsInterface = {
  clientId: randomUUID(),
  userId: "",
  authedUserIDs: [],
  app: {
    logLevel: LogLevel.INFO,
    lastTimeClearLogFile: 0,
    enableColorSpaceSrgb: false,
    useZenity: false,
    panelHeight: 40,
    saveLastOpenedTabs: true,
    exportDir: `${process.env.HOME}/Pictures/Figma`,
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
      `${process.env.HOME}/.local/share/fonts`,
    ],
    recentlyClosedTabs: [],
    windowsState: {},
    lastOpenedTabs: {},
    featureFlags: {},
    frameStyle: "gnome" as Types.FrameStyle,
    savedExtensions: [],
    figmaTheme: "dark" as "dark" | "light",
  },
  ui: {
    scalePanel: 1,
    scaleFigmaUI: 1,
  },
};
