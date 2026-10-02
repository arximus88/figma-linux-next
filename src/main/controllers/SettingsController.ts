/**
 * SettingsController — handles all settings-related IPC channels.
 */
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { app } from "electron";

import { storage } from "../Storage";
import { getResolvedFigmaTheme } from "../Theme";
import { detectFrameStyle, resolveFrameStyle } from "Utils/Main/desktopEnvironment";
import { dialogs } from "../Dialogs";
import {
  type EditableSettings,
  pendingRestart,
  pickEditable,
  planSettingsUpdate,
  type SettingsEffect,
} from "Utils/Common/settingsEdit";
import { ipcRegistry } from "./registry";
import type WindowManager from "../Ui/WindowManager";

export default class SettingsController {
  /**
   * What the app was started with. Restart-only settings are compared against
   * this, not against the previous save, so undoing a change also undoes the
   * restart prompt.
   */
  private readonly launched: EditableSettings;

  constructor(private windowManager: WindowManager) {
    this.launched = pickEditable(storage.settings);
    this.register();
  }

  private register() {
    ipcRegistry.handle("getSettings", () => storage.getSettings(), "SettingsController");
    ipcRegistry.handle("getRuntimeInfo", () => this.getRuntimeInfo(), "SettingsController");
    ipcRegistry.on("setFeatureFlags", storage.setFeatureFlags.bind(storage), "SettingsController");
    ipcRegistry.handle("updateSettings", this.updateSettings.bind(this), "SettingsController");
    ipcRegistry.handle(
      "getPendingRestart",
      () => pendingRestart(this.launched, pickEditable(storage.settings)),
      "SettingsController",
    );
    ipcRegistry.on("restartApp", () => app.emit("relaunchApp"), "SettingsController");
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
  }

  /**
   * One edit from the Settings UI, saved right away. Only the editable fields
   * arrive (see Utils/Common/settingsEdit), so main's own state — window
   * layout, closed-tab history, the signed-in user — is never overwritten by
   * the snapshot Settings loaded with.
   */
  private async updateSettings(
    _: IpcMainInvokeEvent,
    incoming: EditableSettings,
  ): Promise<Types.SettingsSaveResult> {
    const { next, effects } = planSettingsUpdate(pickEditable(storage.settings), incoming);

    Object.assign(storage.settings.app, next.app);
    Object.assign(storage.settings.ui, next.ui);
    Object.assign(storage.settings.mcp, next.mcp);
    await storage.save();

    for (const effect of effects) this.applyEffect(effect);

    return { saved: next, pendingRestart: pendingRestart(this.launched, next) };
  }

  private applyEffect(effect: SettingsEffect) {
    switch (effect.type) {
      case "tray":
        app.emit("trayEnabledChanged", effect.enabled);
        break;
      case "dialogs":
        dialogs.switchProvider(effect.useZenity);
        break;
      case "mcpWriteTools":
        app.emit("mcpWriteToolsChanged", effect.enabled);
        break;
      case "mcpServer":
        app.emit("mcpServerConfigChanged", { enabled: effect.enabled, port: effect.port });
        break;
      case "frameStyle":
        this.windowManager.setFrameStyleAllWindows(resolveFrameStyle(storage.settings.app));
        break;
      case "panelLayout":
        this.windowManager.broadcastSettingsToPanels();
        break;
    }
  }

  /** Everything is saved as it is edited; closing only removes the tab. */
  private closeSettingsView(event?: IpcMainEvent) {
    this.windowManager.closeSettingsViewFor(event?.sender?.id);
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
}
