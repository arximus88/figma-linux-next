/**
 * writeFiles — the export path behind "exporting files doesn't actually save
 * anything".
 *
 * The complaint was impossible to act on because the code left no trace: a
 * dismissed dialog, a name the sanitiser rejected and a failed write all ended
 * the same way — nothing on disk, nothing in the log, nothing shown. On top of
 * that, the failure dialog claimed "remaining files will not be saved" while
 * the loop carried straight on to the next file.
 *
 * These tests pin down that every outcome is now reported: on disk, in the log,
 * and in a single accurate dialog at the end.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logged: { level: string; message: string }[] = [];
const messageBoxes: any[] = [];
let saveDialogResult: string | null = null;
let openDialogResult: string[] | null = null;

mock.module("Main/Logger", () => ({
  logger: {
    info: (m: string) => logged.push({ level: "info", message: m }),
    warn: (m: string) => logged.push({ level: "warn", message: m }),
    error: (m: string) => logged.push({ level: "error", message: m }),
    debug: () => {},
  },
}));

mock.module("Main/Dialogs", () => ({
  dialogs: {
    showSaveDialog: async () => saveDialogResult,
    showOpenDialog: async () => openDialogResult,
    showMessageBox: async (options: any) => {
      messageBoxes.push(options);
      return { response: 0 };
    },
  },
}));

mock.module("Main/Storage", () => ({
  storage: { settings: { app: { exportDir: "/tmp", lastExportDir: "" } } },
}));

const { default: FileController } = await import("Main/controllers/FileController");

let tmpDir: string;

// ipcRegistry is a module-level singleton that refuses duplicate channel
// registrations, so the controller is constructed exactly once for the file.
const controller: any = new FileController({
  getLastFocusedWindow: (): null => null,
} as any);

/** Everything the log recorded, as one searchable blob. */
const logText = () => logged.map((l) => `${l.level} ${l.message}`).join("\n");

const file = (name: string, body = "content") => ({
  name,
  buffer: new Uint8Array(Buffer.from(body)),
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-export-"));
  logged.length = 0;
  messageBoxes.length = 0;
  saveDialogResult = null;
  openDialogResult = null;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const writeFiles = (files: any[]) => controller.writeFiles({} as any, { files });

describe("writeFiles: a successful export", () => {
  test("writes a single file where the save dialog pointed", async () => {
    saveDialogResult = path.join(tmpDir, "design.png");
    await writeFiles([file("design.png", "image-bytes")]);

    const written = path.join(tmpDir, "design.png");
    expect(fs.existsSync(written)).toBe(true);
    expect(fs.readFileSync(written, "utf8")).toBe("image-bytes");
    expect(messageBoxes).toHaveLength(0);
  });

  test("writes every file of a multi-file export into the chosen directory", async () => {
    openDialogResult = [tmpDir];
    await writeFiles([file("a.png"), file("b.png"), file("c.png")]);

    for (const name of ["a.png", "b.png", "c.png"]) {
      expect(fs.existsSync(path.join(tmpDir, name))).toBe(true);
    }
    expect(messageBoxes).toHaveLength(0);
  });

  test("logs the destination and each saved path", async () => {
    // Two files, so this takes the directory-picker branch; a single file is
    // routed through the save dialog instead.
    openDialogResult = [tmpDir];
    await writeFiles([file("a.png"), file("b.png")]);

    expect(logText()).toContain(tmpDir);
    expect(logText()).toContain(path.join(tmpDir, "a.png"));
    expect(logText()).toContain("2 saved, 0 failed");
  });
});

describe("writeFiles: nothing happened, and it says so", () => {
  test("an empty file list is logged rather than ignored", async () => {
    await writeFiles([]);
    expect(logText()).toContain("no files");
  });

  test("dismissing the save dialog is logged as a cancellation", async () => {
    saveDialogResult = null;
    await writeFiles([file("design.png")]);

    expect(logText().toLowerCase()).toContain("cancelled");
    expect(messageBoxes).toHaveLength(0); // cancelling is not an error
  });

  test("dismissing the directory dialog is logged as a cancellation", async () => {
    openDialogResult = null;
    await writeFiles([file("a.png"), file("b.png")]);

    expect(logText().toLowerCase()).toContain("cancelled");
    expect(messageBoxes).toHaveLength(0);
  });
});

describe("writeFiles: failures are reported, once, and accurately", () => {
  test("a write failure names the file and the destination in one dialog", async () => {
    saveDialogResult = path.join(tmpDir, "blocked.png");
    // A directory sitting where the file should go makes the write fail.
    fs.mkdirSync(path.join(tmpDir, "blocked.png"));

    await writeFiles([file("blocked.png")]);

    expect(messageBoxes).toHaveLength(1);
    expect(messageBoxes[0].detail).toContain("blocked.png");
    expect(messageBoxes[0].detail).toContain(tmpDir);
    expect(logText()).toContain("error");
  });

  test("the rest of the batch is still saved after one file fails", async () => {
    openDialogResult = [tmpDir];
    fs.mkdirSync(path.join(tmpDir, "blocked.png"));

    await writeFiles([file("blocked.png"), file("fine.png"), file("also-fine.png")]);

    // The old dialog claimed the remaining files would be skipped; they weren't
    // then and they aren't now — but the message used to say otherwise.
    expect(fs.existsSync(path.join(tmpDir, "fine.png"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "also-fine.png"))).toBe(true);

    expect(messageBoxes).toHaveLength(1);
    expect(messageBoxes[0].message).toContain("1 of 3");
  });

  test("several failures are collected into a single dialog", async () => {
    openDialogResult = [tmpDir];
    fs.mkdirSync(path.join(tmpDir, "one.png"));
    fs.mkdirSync(path.join(tmpDir, "two.png"));

    await writeFiles([file("one.png"), file("two.png")]);

    expect(messageBoxes).toHaveLength(1);
    expect(messageBoxes[0].detail).toContain("one.png");
    expect(messageBoxes[0].detail).toContain("two.png");
  });

  test("a name the sanitiser rejects is reported, not silently dropped", async () => {
    openDialogResult = [tmpDir];
    await writeFiles([file(".."), file("good.png")]);

    expect(fs.existsSync(path.join(tmpDir, "good.png"))).toBe(true);
    expect(logText()).toContain("unsafe export name");
    expect(messageBoxes).toHaveLength(1);
  });

  test("the summary counts saved and failed files", async () => {
    openDialogResult = [tmpDir];
    fs.mkdirSync(path.join(tmpDir, "bad.png"));

    await writeFiles([file("bad.png"), file("ok.png")]);
    expect(logText()).toContain("1 saved, 1 failed");
  });
});

describe("writeFiles: names stay inside the chosen directory", () => {
  test("a traversing name is written into the directory, not above it", async () => {
    openDialogResult = [tmpDir];
    await writeFiles([file("../escaped.png")]);

    expect(fs.existsSync(path.join(path.dirname(tmpDir), "escaped.png"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "escaped.png"))).toBe(true);
  });
});
