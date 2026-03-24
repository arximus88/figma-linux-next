/**
 * SettingsController — handles all settings-related IPC channels.
 */
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { app } from "electron";

import { storage } from "../Storage";
import { dialogs } from "../Dialogs";
import { ipcRegistry } from "./registry";
import type WindowManager from "../Ui/WindowManager";

export default class SettingsController {
  constructor(private windowManager: WindowManager) {
    this.register();
  }

  private register() {
    ipcRegistry.handle("getSettings", () => storage.getSettings(), "SettingsController");
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
  }

  private async closeSettingsView(_: IpcMainEvent, settings: Types.SettingsInterface) {
    if (storage.settings.app.enableColorSpaceSrgb !== settings.app.enableColorSpaceSrgb) {
      app.emit("enableColorSpaceSrgbWasChanged", true);
    }
    if (
      JSON.stringify(storage.settings.app.commandSwitches) !==
      JSON.stringify(settings.app.commandSwitches)
    ) {
      app.emit("chromiumFlagsChanged", true);
    }
    if (storage.settings.app.useZenity !== settings.app.useZenity) {
      dialogs.switchProvider(settings.app.useZenity);
    }
    if (storage.settings.mcp?.enableWriteTools !== settings.mcp?.enableWriteTools) {
      app.emit("mcpWriteToolsChanged", !!settings.mcp?.enableWriteTools);
    }

    storage.settings = settings;
    await storage.save();

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

  private setFrameStyle(_: IpcMainEvent, style: Types.FrameStyle) {
    storage.settings.app.frameStyle = style;
    storage.save();
    this.windowManager.setFrameStyleAllWindows(style);
  }
}
