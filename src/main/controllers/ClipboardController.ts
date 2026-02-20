/**
 * ClipboardController — handles clipboard data IPC channels.
 */
import type { IpcMainEvent } from "electron";
import { clipboard, nativeImage } from "electron";

import { ipcRegistry } from "./registry";

export default class ClipboardController {
  constructor() {
    this.register();
  }

  private register() {
    ipcRegistry.on("setClipboardData", this.setClipboardData.bind(this), "ClipboardController");
  }

  private setClipboardData(_: IpcMainEvent, data: WebApi.SetClipboardData) {
    const format = data.format;
    const buffer = Buffer.from(data.data);

    if (["image/jpeg", "image/png"].indexOf(format) !== -1) {
      clipboard.writeImage(nativeImage.createFromBuffer(buffer));
    } else if (format === "image/svg+xml") {
      clipboard.writeText(buffer.toString());
    } else if (format === "application/pdf") {
      clipboard.writeBuffer("Portable Document Format", buffer);
    } else {
      clipboard.writeBuffer(format, buffer);
    }
  }
}
