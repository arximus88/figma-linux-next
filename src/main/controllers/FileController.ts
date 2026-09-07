/**
 * FileController — handles file creation and export IPC channels.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import type { IpcMainInvokeEvent } from "electron";

import { storage } from "../Storage";
import { dialogs } from "../Dialogs";
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

  private async writeFiles(_: IpcMainInvokeEvent, args: WebApi.WriteFiles) {
    const files = args.files;

    if (!files.length) {
      return;
    }

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
      }
    } else {
      const directories = await dialogs.showOpenDialog({
        title: "Choose directory for export files",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Save",
        defaultPath: lastDir,
      });
      if (directories?.length !== 1) {
        return;
      }
      directoryPath = directories[0];
      storage.settings.app.lastExportDir = directoryPath;
    }

    if (!directoryPath) {
      return;
    }

    for (const file of files) {
      // Names come from the web app; keep every write inside the chosen directory.
      const name = safeExportName(file.name);
      if (!name) continue;
      const outputPath = path.join(directoryPath, name);
      await mkPath(path.dirname(outputPath));

      try {
        await fs.promises.writeFile(outputPath, Buffer.from(file.buffer));
      } catch {
        await dialogs.showMessageBox({
          type: "error",
          title: "Export Failed",
          message: "Saving file failed",
          detail: `"${file.name}" could not be saved. Remaining files will not be saved.`,
        });
      }
    }
  }
}
