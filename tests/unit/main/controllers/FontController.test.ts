/**
 * getFontFile — issue #83: a font that fc-list reported and the picker showed
 * could not be applied, because the file had to sit under one of the
 * configured font directories. NixOS keeps fonts in /nix/store/<hash>-.../ and
 * the Flatpak sandbox exposes /usr/local/share/fonts as /run/host/local-fonts,
 * neither of which is in the defaults.
 *
 * The page still chooses the path, so anything that is neither a listed font
 * nor under a font directory must stay refused.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const warnings: string[] = [];

mock.module("Main/Logger", () => ({
  logger: {
    info: () => {},
    warn: (m: string) => warnings.push(m),
    error: () => {},
    debug: () => {},
  },
}));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "figma-fonts-"));
const fontDir = path.join(tmp, "share", "fonts");
const nixStoreFont = path.join(tmp, "nix", "store", "y7rn-adwaita-fonts-50.0", "AdwaitaSans.ttf");
const flatpakFont = path.join(tmp, "run", "host", "local-fonts", "s", "SudburyBook.ttf");
const dirFont = path.join(fontDir, "Added-later.otf");
const secret = path.join(tmp, "home", ".ssh", "id_ed25519");

for (const f of [nixStoreFont, flatpakFont, dirFont, secret]) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `bytes of ${path.basename(f)}`);
}

mock.module("Main/Storage", () => ({
  storage: { settings: { app: { fontDirs: [fontDir] } } },
}));

const { default: FontManager } = await import("Main/Fonts");
const { default: FontController } = await import("Main/controllers/FontController");

/** A FontManager whose fc-list returned the given files. */
class ListedFonts extends FontManager {
  constructor(private files: string[]) {
    super();
  }
  public getFonts = async () =>
    Object.fromEntries(this.files.map((f) => [f, [{ family: path.basename(f) } as any]]));
}

const manager = new ListedFonts([nixStoreFont, flatpakFont]);
// ipcRegistry refuses duplicate channels, so one controller for the file.
const controller: any = new FontController(manager);

const getFontFile = (p: string) => controller.getFontFile({} as any, { path: p });

beforeEach(() => {
  warnings.length = 0;
});

describe("getFontFile", () => {
  test("serves a fc-list font from the nix store (#83)", async () => {
    const file = await getFontFile(nixStoreFont);
    expect(file?.toString()).toBe("bytes of AdwaitaSans.ttf");
    expect(warnings).toEqual([]);
  });

  test("serves a fc-list font from the Flatpak host font mount (#83)", async () => {
    const file = await getFontFile(flatpakFont);
    expect(file?.toString()).toBe("bytes of SudburyBook.ttf");
  });

  test("still serves an unlisted file under a configured font directory", async () => {
    const file = await getFontFile(dirFont);
    expect(file?.toString()).toBe("bytes of Added-later.otf");
  });

  test("refuses a file that is neither listed nor in a font directory", async () => {
    expect(await getFontFile(secret)).toBeNull();
    expect(warnings.join("\n")).toContain(secret);
  });

  test("refuses a listed path with .. tricks that lands elsewhere", async () => {
    const traversal = `${path.dirname(nixStoreFont)}/../../../home/.ssh/id_ed25519`;
    expect(await getFontFile(traversal)).toBeNull();
    expect(
      await getFontFile(path.join(fontDir, "..", "..", "home", ".ssh", "id_ed25519")),
    ).toBeNull();
  });
});
