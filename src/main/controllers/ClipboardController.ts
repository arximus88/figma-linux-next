/**
 * ClipboardController — handles clipboard data IPC channels.
 *
 * Electron 44 rebuilt `clipboard` around the W3C model: everything is async,
 * payloads travel as ClipboardItem → Blob keyed by MIME type, and the module is
 * gone from renderers. Both directions of Figma's clipboard traffic therefore
 * live here; the tab preload only forwards.
 */
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { clipboard, ClipboardItem, nativeImage } from "electron";

import { logger } from "Main/Logger";
import { ipcRegistry } from "./registry";

/** Native pasteboard names some apps still use for SVG, tried after the MIME type. */
const SVG_ALIASES = ["Scalable Vector Graphics", "CorePasteboardFlavorType 0x53564720"];

export default class ClipboardController {
  constructor() {
    this.register();
  }

  private register() {
    ipcRegistry.on("setClipboardData", this.setClipboardData.bind(this), "ClipboardController");
    ipcRegistry.handle("getClipboardData", this.getClipboardData.bind(this), "ClipboardController");
  }

  private setClipboardData(_: IpcMainEvent, data: WebApi.SetClipboardData) {
    const buffer = Buffer.from(data.data);
    // Figma hands SVG over as bytes; on the clipboard it is expected as text so
    // editors and browsers paste it as markup, not as an opaque blob.
    const mime = data.format === "image/svg+xml" ? "text/plain" : data.format;
    const item = new ClipboardItem({ [mime]: new Blob([buffer], { type: mime }) });

    clipboard.write([item]).catch((error: unknown) => {
      logger.error(`Clipboard write failed for ${data.format}:`, error);
    });
  }

  /**
   * Figma asks for a list of formats in preference order; answer with the first
   * one the clipboard can satisfy, or null. Mirrors the pre-44 preload logic:
   * Figma-tagged HTML only, SVG via MIME → legacy names → `<svg>` text, raster
   * images as a bitmap.
   */
  private async getClipboardData(
    _: IpcMainInvokeEvent,
    formats: string[],
  ): Promise<{ data: ArrayBuffer; format: string } | null> {
    if (await clipboard.has("org.nspasteboard.ConcealedType")) {
      logger.warn("Clipboard unavailable (concealed content)");
      return null;
    }

    const items = await clipboard.read();
    const readBytes = async (mime: string): Promise<Buffer | null> => {
      for (const item of items) {
        if (!item.types.includes(mime)) continue;
        const payload = await item.getType(mime);
        // Bookmarks come back as { title, url } objects, not Blobs — never asked for here.
        if (!(payload instanceof Blob)) continue;
        const buf = Buffer.from(await payload.arrayBuffer());
        if (buf.byteLength > 0) return buf;
      }
      return null;
    };
    const readString = async (mime: string) => (await readBytes(mime))?.toString("utf8") ?? "";

    for (const format of formats) {
      let data: Buffer | null = null;

      if (format === "text/html") {
        const unsafeHTML = (await readString("text/html")).trim();
        if (unsafeHTML.includes("<!--(figma)") && unsafeHTML.includes("(/figma)-->")) {
          data = Buffer.from(unsafeHTML);
        }
      } else if (format === "image/svg+xml") {
        for (const name of [format, ...SVG_ALIASES]) {
          data = await readBytes(name);
          if (data) break;
        }
        if (!data) {
          const unsafeText = (await readString("text/plain")).trim();
          if (unsafeText.startsWith("<svg") && unsafeText.endsWith("</svg>")) {
            data = Buffer.from(unsafeText);
          }
        }
      } else if (format === "image/jpeg" || format === "image/png") {
        const png = (await readBytes("image/png")) ?? (await readBytes("image/jpeg"));
        if (png) data = nativeImage.createFromBuffer(png).toBitmap();
      } else {
        data = await readBytes(format);
      }

      if (data && data.byteLength > 0) {
        // Copy into a standalone ArrayBuffer so the IPC transfer carries exactly these bytes.
        const out = new ArrayBuffer(data.byteLength);
        new Uint8Array(out).set(data);
        return { data: out, format };
      }
    }

    return null;
  }
}
