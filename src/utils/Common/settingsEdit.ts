/**
 * What the Settings UI may change, and what a change sets in motion.
 *
 * The Settings renderer used to send its whole settings object back on close,
 * and main stored it wholesale. That object was a snapshot taken when Settings
 * loaded, so it also carried `windowsState`, `recentlyClosedTabs`, `userId`,
 * `lastExportDir`… — closing Settings rolled back whatever main had changed in
 * those meanwhile. Settings now saves as you edit, and sends only the fields
 * listed here; everything else stays main's.
 */

export const EDITABLE_APP_KEYS = [
  "enableColorSpaceSrgb",
  "enableWebGPU",
  "useZenity",
  "saveLastOpenedTabs",
  "exportDir",
  "fontDirs",
  "commandSwitches",
  "frameStyle",
  "frameStyleAuto",
  "hideWindowMinMaxButtons",
  "newTabButtonAfterTabs",
  "tabHoverPreviews",
  "trayEnabled",
  "panelHeight",
] as const;

export const EDITABLE_UI_KEYS = ["scalePanel", "scaleFigmaUI"] as const;

export const EDITABLE_MCP_KEYS = [
  "serverEnabled",
  "serverPort",
  "enableWriteTools",
  "cdpEnabled",
  "remoteDebugPort",
] as const;

type App = Types.SettingsInterface["app"];
type Ui = Types.SettingsInterface["ui"];
type Mcp = Types.SettingsInterface["mcp"];

export interface EditableSettings {
  app: Pick<App, (typeof EDITABLE_APP_KEYS)[number]>;
  ui: Pick<Ui, (typeof EDITABLE_UI_KEYS)[number]>;
  mcp: Pick<Mcp, (typeof EDITABLE_MCP_KEYS)[number]>;
}

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    // Deep copy: arrays (fontDirs, commandSwitches) must not alias the source.
    out[key] = structuredClone(source[key]);
  }
  return out;
}

export function pickEditable(settings: EditableSettings): EditableSettings {
  return {
    app: pick(settings.app, EDITABLE_APP_KEYS),
    ui: pick(settings.ui, EDITABLE_UI_KEYS),
    mcp: pick(settings.mcp, EDITABLE_MCP_KEYS),
  };
}

export function isValidPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** Switches the user left blank are rows still being typed, not switches. */
export function cleanCommandSwitches(switches: Types.CommandSwitch[]): Types.CommandSwitch[] {
  return switches
    .map((s) => {
      const value = s.value?.trim();
      return value ? { switch: s.switch.trim(), value } : { switch: s.switch.trim() };
    })
    .filter((s) => s.switch !== "");
}

/**
 * Settings that only take effect when the app starts. Each entry compares the
 * value the app was launched with against the saved one, so flipping a switch
 * and flipping it back clears the restart prompt again.
 */
const RESTART_CHECKS: {
  label: string;
  differs: (a: EditableSettings, b: EditableSettings) => boolean;
}[] = [
  {
    label: "sRGB color space",
    differs: (a, b) => a.app.enableColorSpaceSrgb !== b.app.enableColorSpaceSrgb,
  },
  { label: "WebGPU shaders", differs: (a, b) => a.app.enableWebGPU !== b.app.enableWebGPU },
  {
    label: "Chromium switches",
    differs: (a, b) =>
      JSON.stringify(cleanCommandSwitches(a.app.commandSwitches)) !==
      JSON.stringify(cleanCommandSwitches(b.app.commandSwitches)),
  },
  {
    label: "Chrome DevTools",
    differs: (a, b) =>
      a.mcp.cdpEnabled !== b.mcp.cdpEnabled ||
      (b.mcp.cdpEnabled && a.mcp.remoteDebugPort !== b.mcp.remoteDebugPort),
  },
];

/** Labels of the settings saved since launch that wait for a restart. */
export function pendingRestart(launched: EditableSettings, saved: EditableSettings): string[] {
  return RESTART_CHECKS.filter((check) => check.differs(launched, saved)).map((c) => c.label);
}

export type SettingsEffect =
  | { type: "tray"; enabled: boolean }
  | { type: "dialogs"; useZenity: boolean }
  | { type: "mcpWriteTools"; enabled: boolean }
  | { type: "mcpServer"; enabled: boolean; port: number }
  | { type: "frameStyle" }
  | { type: "panelLayout" };

/**
 * Merge an edit into the current editable settings and list what has to react.
 *
 * Invalid input does not get saved: a port outside 1024–65535, or one equal to
 * the other service's, keeps the current value (the UI marks the field), so a
 * half-typed "38" never restarts the MCP server on port 38.
 */
export function planSettingsUpdate(
  current: EditableSettings,
  incoming: EditableSettings,
): { next: EditableSettings; effects: SettingsEffect[] } {
  const next = pickEditable(incoming);
  next.app.commandSwitches = cleanCommandSwitches(next.app.commandSwitches);

  if (!isValidPort(next.mcp.serverPort)) next.mcp.serverPort = current.mcp.serverPort;
  if (!isValidPort(next.mcp.remoteDebugPort))
    next.mcp.remoteDebugPort = current.mcp.remoteDebugPort;
  if (next.mcp.serverPort === next.mcp.remoteDebugPort) {
    next.mcp.serverPort = current.mcp.serverPort;
    next.mcp.remoteDebugPort = current.mcp.remoteDebugPort;
  }

  const effects: SettingsEffect[] = [];
  const a = current;
  const b = next;

  if (a.app.trayEnabled !== b.app.trayEnabled) {
    effects.push({ type: "tray", enabled: !!b.app.trayEnabled });
  }
  if (a.app.useZenity !== b.app.useZenity) {
    effects.push({ type: "dialogs", useZenity: b.app.useZenity });
  }
  if (a.mcp.enableWriteTools !== b.mcp.enableWriteTools) {
    effects.push({ type: "mcpWriteTools", enabled: !!b.mcp.enableWriteTools });
  }
  if (a.mcp.serverEnabled !== b.mcp.serverEnabled || a.mcp.serverPort !== b.mcp.serverPort) {
    effects.push({
      type: "mcpServer",
      enabled: b.mcp.serverEnabled !== false,
      port: b.mcp.serverPort,
    });
  }
  if (a.app.frameStyleAuto !== b.app.frameStyleAuto || a.app.frameStyle !== b.app.frameStyle) {
    effects.push({ type: "frameStyle" });
  }
  if (
    a.app.hideWindowMinMaxButtons !== b.app.hideWindowMinMaxButtons ||
    a.app.newTabButtonAfterTabs !== b.app.newTabButtonAfterTabs ||
    a.app.tabHoverPreviews !== b.app.tabHoverPreviews
  ) {
    effects.push({ type: "panelLayout" });
  }

  return { next, effects };
}
