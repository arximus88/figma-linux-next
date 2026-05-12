import type { IpcMainEvent } from "electron";
import { shell } from "electron";

import { storage } from "../Storage";
import { ipcRegistry } from "./registry";
import { readAppVersion } from "Utils/Main";
import type WindowManager from "../Ui/WindowManager";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export default class ChangelogController {
  constructor(private windowManager: WindowManager) {
    this.register();
  }

  private register() {
    ipcRegistry.on("closeChangelogView", this.closeChangelogView.bind(this), "ChangelogController");
    ipcRegistry.on("openExternal", this.openExternal.bind(this), "ChangelogController");
  }

  private async closeChangelogView(_: IpcMainEvent) {
    const current = readAppVersion();
    if (current && storage.settings.app.lastSeenChangelogVersion !== current) {
      storage.settings.app.lastSeenChangelogVersion = current;
      await storage.save();
    }
    this.windowManager.closeChangelogViewForLastWindow();
  }

  private openExternal(_: IpcMainEvent, url: string) {
    if (typeof url !== "string") return;
    try {
      const parsed = new URL(url);
      if (!SAFE_PROTOCOLS.has(parsed.protocol)) return;
      shell.openExternal(parsed.toString());
    } catch {
      // ignore malformed URLs
    }
  }
}
