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
    // The path comes from the Figma page, so it must be a font we listed:
    // otherwise this is an arbitrary file read. fc-list puts fonts wherever the
    // system keeps them (/nix/store/... on NixOS, /run/host/local-fonts in the
    // Flatpak sandbox), so the list itself is the allowlist; the configured
    // font directories still cover files added after the list was built.
    const dirs = storage.settings.app.fontDirs;
    const listed = await this.fontManager.getFonts(dirs);
    if (!Object.hasOwn(listed, data.path) && !isInsideDirs(data.path, dirs)) {
      logger.warn(
        `getFontFile: refused path that is neither a listed font nor in fontDirs: ${data.path}`,
      );
      return null;
    }
    const file = await this.fontManager.getFontFile(data.path);

    if (file && file.byteLength > 0) {
      return file;
    }

    return null;
  }
}
