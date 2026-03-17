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
