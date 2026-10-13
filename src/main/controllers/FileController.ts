/**
 * FileController — handles file creation and export IPC channels.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import type { IpcMainInvokeEvent } from "electron";

import { storage } from "../Storage";
import { dialogs } from "../Dialogs";
import { logger } from "../Logger";
import { mkPath } from "Utils/Main";
import { safeExportName } from "Utils/Main/safePath";
import { ipcRegistry } from "./registry";
import type WindowManager from "../Ui/WindowManager";

export default class FileController {
  constructor(private windowManager: WindowManager) {
    this.register();
  }

  private register() {
    ipcRegistry.handle("writeFiles", this.writeFiles.bind(this), "FileController");
    ipcRegistry.handle("createFile", this.createFile.bind(this), "FileController");
  }

  private async createFile(_: IpcMainInvokeEvent, args: WebApi.CreateFile) {
    const window = this.windowManager.getLastFocusedWindow();

    if (window) {
      return window.createFile(args);
    }
  }

  /**
   * Save the files the web app handed us.
   *
   * Every early return and every failure is logged. Before that, an export
   * could do nothing at all — cancelled dialog, a name the sanitiser rejected,
   * a failed write — and leave no trace anywhere, which made "exporting doesn't
   * save anything" reports impossible to act on: there was no way to tell which
   * of those had happened, or even whether the app had been asked to export.
   */
  private async writeFiles(_: IpcMainInvokeEvent, args: WebApi.WriteFiles) {
    const files = args.files;

    if (!files.length) {
      logger.warn("writeFiles: the web app sent no files, nothing to export");
      return;
    }

    logger.info(`writeFiles: exporting ${files.length} file(s)`);

    let directoryPath = null;
    const lastDir = storage.settings.app.lastExportDir || storage.settings.app.exportDir;

    if (files.length === 1 && !files[0].name.includes(path.sep)) {
      const originalFileName = files[0].name;
      const savePath = await dialogs.showSaveDialog({
        title: "Choose directory for export file",
        defaultPath: `${lastDir}/${path.basename(originalFileName)}`,
        showsTagField: false,
      });

      if (savePath) {
        directoryPath = path.dirname(savePath);
        files[0].name = path.basename(savePath);
        if (path.extname(files[0].name) === "") {
          files[0].name += path.extname(originalFileName);
        }

        storage.settings.app.lastExportDir = path.parse(savePath).dir;
      } else {
        logger.info("writeFiles: save dialog dismissed, export cancelled");
      }
    } else {
      const directories = await dialogs.showOpenDialog({
        title: "Choose directory for export files",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Save",
        defaultPath: lastDir,
      });
      if (directories?.length !== 1) {
        logger.info("writeFiles: directory dialog dismissed, export cancelled");
        return;
      }
      directoryPath = directories[0];
      storage.settings.app.lastExportDir = directoryPath;
    }

    if (!directoryPath) {
      return;
    }

    logger.info(`writeFiles: export directory is "${directoryPath}"`);

    const failed: { name: string; reason: string }[] = [];
    let saved = 0;

    for (const file of files) {
      // Names come from the web app; keep every write inside the chosen directory.
      const name = safeExportName(file.name);
      if (!name) {
        logger.error(`writeFiles: refusing unsafe export name "${file.name}", skipped`);
        failed.push({ name: file.name, reason: "the file name is not usable" });
        continue;
      }

      const outputPath = path.join(directoryPath, name);

      try {
        await mkPath(path.dirname(outputPath));
        await fs.promises.writeFile(outputPath, Buffer.from(file.buffer));
        saved++;
        logger.info(`writeFiles: saved "${outputPath}"`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(`writeFiles: could not save "${outputPath}": ${reason}`);
        failed.push({ name: file.name, reason });
      }
    }

    logger.info(`writeFiles: ${saved} saved, ${failed.length} failed`);

    // One dialog at the end, not one per file, and it now says what actually
    // happened — the old text claimed the remaining files would be skipped
    // while the loop carried on regardless.
    if (failed.length > 0) {
      const list = failed.map((f) => `• ${f.name} — ${f.reason}`).join("\n");
      await dialogs.showMessageBox({
        type: "error",
        title: "Export Failed",
        message:
          saved > 0
            ? `${failed.length} of ${files.length} files could not be saved`
            : "The files could not be saved",
        detail: `${list}\n\nDestination: ${directoryPath}`,
      });
    }
  }
}
