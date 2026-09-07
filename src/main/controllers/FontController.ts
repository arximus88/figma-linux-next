/**
 * FontController — handles font enumeration and file serving IPC channels.
 */
import type { IpcMainInvokeEvent } from "electron";

import { storage } from "../Storage";
import type FontManager from "../Fonts";
import { logger } from "../Logger";
import { ipcRegistry } from "./registry";
import { isInsideDirs } from "Utils/Main/safePath";

export default class FontController {
  constructor(private fontManager: FontManager) {
    this.register();
  }

  private register() {
    ipcRegistry.handle("getFonts", this.getFonts.bind(this), "FontController");
    ipcRegistry.handle("getFontFile", this.getFontFile.bind(this), "FontController");
  }

  private async getFonts(_: IpcMainInvokeEvent) {
    const dirs = storage.settings.app.fontDirs;

    return this.fontManager.getFonts(dirs);
  }

  private async getFontFile(_: IpcMainInvokeEvent, data: WebApi.GetFontFile) {
    // The path comes from the Figma page. Only files under the configured
    // font directories may be read — otherwise this is an arbitrary file read.
    if (!isInsideDirs(data.path, storage.settings.app.fontDirs)) {
      logger.warn(`getFontFile: refused path outside fontDirs: ${data.path}`);
      return null;
    }
    const file = await this.fontManager.getFontFile(data.path);

    if (file && file.byteLength > 0) {
      return file;
    }

    return null;
  }
}
