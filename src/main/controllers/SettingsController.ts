/**
 * SettingsController — handles all settings-related IPC channels.
 */
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { app } from "electron";

import { storage } from "../Storage";
import { getResolvedFigmaTheme } from "../Theme";
import { detectFrameStyle, resolveFrameStyle } from "Utils/Main/desktopEnvironment";
import { dialogs } from "../Dialogs";
import { ipcRegistry } from "./registry";
import type WindowManager from "../Ui/WindowManager";

export default class SettingsController {
  constructor(private windowManager: WindowManager) {
    this.register();
  }

  private register() {
    ipcRegistry.handle("getSettings", () => storage.getSettings(), "SettingsController");
    ipcRegistry.handle("getRuntimeInfo", () => this.getRuntimeInfo(), "SettingsController");
    ipcRegistry.on("setFeatureFlags", storage.setFeatureFlags.bind(storage), "SettingsController");
    ipcRegistry.on("closeSettingsView", this.closeSettingsView.bind(this), "SettingsController");
    ipcRegistry.handle(
      "selectExportDirectory",
      this.selectExportDirectory.bind(this),
      "SettingsController",
    );
    ipcRegistry.handle("updatePanelScale", this.updatePanelScale.bind(this), "SettingsController");
    ipcRegistry.handle(
      "updateFigmaUiScale",
      this.updateFigmaUiScale.bind(this),
      "SettingsController",
    );
    ipcRegistry.handle(
      "isDevToolsOpened",
      (event: IpcMainInvokeEvent) => event.sender.isDevToolsOpened(),
      "SettingsController",
    );
    ipcRegistry.on("setFrameStyle", this.setFrameStyle.bind(this), "SettingsController");
    ipcRegistry.on("setTrayEnabled", this.setTrayEnabled.bind(this), "SettingsController");
  }

  private async closeSettingsView(_: IpcMainEvent, settings: Types.SettingsInterface) {
    if (storage.settings.app.enableColorSpaceSrgb !== settings.app.enableColorSpaceSrgb) {
      app.emit("enableColorSpaceSrgbWasChanged", settings.app.enableColorSpaceSrgb);
    }
    if (storage.settings.app.enableWebGPU !== settings.app.enableWebGPU) {
      // Forces ozone=x11 + Skia Graphite, which only apply at process startup → restart.
      app.emit("chromiumFlagsChanged", true);
    }
    if (
      JSON.stringify(storage.settings.app.commandSwitches) !==
      JSON.stringify(settings.app.commandSwitches)
    ) {
      app.emit("chromiumFlagsChanged", true);
    }
    if (storage.settings.app.trayEnabled !== settings.app.trayEnabled) {
      app.emit("trayEnabledChanged", !!settings.app.trayEnabled);
    }
    if (storage.settings.app.useZenity !== settings.app.useZenity) {
      dialogs.switchProvider(settings.app.useZenity);
    }
    if (storage.settings.mcp?.enableWriteTools !== settings.mcp?.enableWriteTools) {
      app.emit("mcpWriteToolsChanged", !!settings.mcp?.enableWriteTools);
    }
    if (
      storage.settings.mcp?.serverEnabled !== settings.mcp?.serverEnabled ||
      storage.settings.mcp?.serverPort !== settings.mcp?.serverPort
    ) {
      app.emit("mcpServerConfigChanged", {
        enabled: settings.mcp?.serverEnabled !== false,
        port: settings.mcp?.serverPort ?? 3845,
      });
    }
    if (
      storage.settings.mcp?.cdpEnabled !== settings.mcp?.cdpEnabled ||
      storage.settings.mcp?.remoteDebugPort !== settings.mcp?.remoteDebugPort
    ) {
      app.emit("chromiumFlagsChanged", true);
    }

    const panelLayoutChanged =
      storage.settings.app.hideWindowMinMaxButtons !== settings.app.hideWindowMinMaxButtons ||
      storage.settings.app.newTabButtonAfterTabs !== settings.app.newTabButtonAfterTabs;
    const frameChanged =
      storage.settings.app.frameStyleAuto !== settings.app.frameStyleAuto ||
      storage.settings.app.frameStyle !== settings.app.frameStyle;

    storage.settings = settings;
    await storage.save();

    if (frameChanged) {
      this.windowManager.setFrameStyleAllWindows(resolveFrameStyle(settings.app));
    }

    if (panelLayoutChanged) {
      this.windowManager.broadcastSettingsToPanels();
    }

    this.windowManager.closeSettingsViewForLastWindow();
  }

  private async selectExportDirectory(_: IpcMainInvokeEvent) {
    const directories = await dialogs.showOpenDialog({ properties: ["openDirectory"] });

    if (!directories) {
      return null;
    }

    return directories[0];
  }

  private updatePanelScale(_: IpcMainInvokeEvent, scale: number) {
    this.windowManager.updatePanelScaleAllWindows(scale);
  }

  private updateFigmaUiScale(_: IpcMainInvokeEvent, scale: number) {
    this.windowManager.updateFigmaUiScaleAllWindows(scale);
  }

  /** Values only main can resolve (env, nativeTheme) — the renderers ask for these on boot. */
  private getRuntimeInfo(): Types.RuntimeInfo {
    return {
      frameStyle: resolveFrameStyle(storage.settings.app),
      detectedFrameStyle: detectFrameStyle(),
      theme: getResolvedFigmaTheme(),
    };
  }

  /** Live change from the Settings toggle — the tray appears/disappears immediately. */
  private setTrayEnabled(_: IpcMainEvent, enabled: unknown) {
    const on = !!enabled;
    if (storage.settings.app.trayEnabled === on) return;
    storage.settings.app.trayEnabled = on;
    storage.save();
    app.emit("trayEnabledChanged", on);
  }

  /** Live change from the Settings select. Only visible while auto-detect is off. */
  private setFrameStyle(_: IpcMainEvent, style: Types.FrameStyle) {
    if (storage.settings.app.frameStyle === style) return;

    storage.settings.app.frameStyle = style;
    storage.save();
    if (!storage.settings.app.frameStyleAuto) {
      this.windowManager.setFrameStyleAllWindows(style);
    }
  }
}
