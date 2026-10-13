import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ZenityDialogs } from "Main/Dialogs/Zenity";

// A stand-in for zenity 4 on PATH: it warns on stderr about --confirm-overwrite (as
// zenity 4.2 does) and still exits 0 printing the chosen path, which is the value of
// --filename. FAKE_ZENITY_EXIT=1 plays the user pressing Cancel. Every argv entry is
// written to args.txt, one per line, so tests can see how they arrived.
const FAKE_ZENITY = `#!/bin/sh
: > "$FAKE_ZENITY_DIR/args.txt"
chosen=""
for a in "$@"; do
  printf '%s\\n' "$a" >> "$FAKE_ZENITY_DIR/args.txt"
  case "$a" in
    --confirm-overwrite) echo "Warning: --confirm-overwrite is deprecated and will be removed in a future version of zenity. Ignoring." >&2 ;;
    --filename=*) chosen="\${a#--filename=}" ;;
  esac
done
[ "\${FAKE_ZENITY_EXIT:-0}" = 0 ] || exit "$FAKE_ZENITY_EXIT"
printf '%s\\n' "$chosen"
`;

describe("ZenityDialogs", () => {
  let dir: string;
  let savedPath: string | undefined;
  const dialogs = new ZenityDialogs();

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "fake-zenity-"));
    writeFileSync(join(dir, "zenity"), FAKE_ZENITY);
    chmodSync(join(dir, "zenity"), 0o755);
    savedPath = process.env.PATH;
    process.env.PATH = `${dir}:${savedPath}`;
    process.env.FAKE_ZENITY_DIR = dir;
  });

  afterAll(() => {
    process.env.PATH = savedPath;
    delete process.env.FAKE_ZENITY_DIR;
    delete process.env.FAKE_ZENITY_EXIT;
    rmSync(dir, { recursive: true, force: true });
  });

  // #56: the warning on stderr used to count as a failure, so Save cancelled the export.
  it("returns the chosen path when zenity warns on stderr but exits 0", async () => {
    const path = "/home/u/Figma/Vector 45.svg";

    expect(await dialogs.showSaveDialog({ defaultPath: path })).toBe(path);
    expect(dialogs.showSaveDialogSync({ defaultPath: path })).toBe(path);
  });

  it("returns null when the user cancels", async () => {
    process.env.FAKE_ZENITY_EXIT = "1";
    try {
      expect(await dialogs.showSaveDialog({ defaultPath: "/tmp/a.svg" })).toBeNull();
      expect(dialogs.showSaveDialogSync({ defaultPath: "/tmp/a.svg" })).toBeNull();
      expect(await dialogs.showOpenDialog({})).toBeNull();
    } finally {
      delete process.env.FAKE_ZENITY_EXIT;
    }
  });

  it("passes a file name with shell characters through untouched", async () => {
    const marker = join(dir, "pwned");
    const path = `/home/u/"$(touch ${marker})\` it's.svg`;

    expect(await dialogs.showSaveDialog({ defaultPath: path })).toBe(path);
    expect(existsSync(marker)).toBe(false);
  });

  it("sends message box text as one argument, quotes and newline intact", async () => {
    const result = await dialogs.showMessageBox({
      type: "question",
      title: 'Export "Frame 1"',
      message: "Overwrite?",
      detail: 'File "a.svg" exists',
      defaultFocusedButton: "Cancel",
    });

    expect(result).toBe(0);
    const args = readFileSync(join(dir, "args.txt"), "utf8");
    expect(args).toContain('--title=Export "Frame 1"\n');
    expect(args).toContain('--text=Overwrite?\nFile "a.svg" exists\n');
    expect(args).toContain("--cancel-label=Cancel\n--default-cancel\n");
  });
});
