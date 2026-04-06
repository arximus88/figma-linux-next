import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { logger } from "./Logger";

const DESKTOP_FILENAME = "figma-linux-next-appimage.desktop";

function buildDesktopEntry(appImagePath: string): string {
  return (
    [
      "[Desktop Entry]",
      "Name=Figma Linux Next",
      "Comment=Unofficial Figma desktop app for Linux",
      `Exec=${appImagePath} %U`,
      "Terminal=false",
      "Type=Application",
      "Icon=figma-linux-next",
      "StartupWMClass=figma-linux-next",
      "Categories=Graphics;",
      "MimeType=application/figma;x-scheme-handler/figma;",
    ].join("\n") + "\n"
  );
}

function isAlreadyRegistered(): boolean {
  const result = spawnSync("xdg-mime", ["query", "default", "x-scheme-handler/figma"], {
    encoding: "utf8",
  });
  return result.stdout?.trim() === DESKTOP_FILENAME;
}

/**
 * When running as an AppImage, registers the figma:// URL handler by writing
 * a .desktop file to ~/.local/share/applications/ and calling xdg-mime.
 * No-op if not running as AppImage or handler is already registered.
 */
export function registerAppImageUrlHandler(): void {
  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath) return;

  if (isAlreadyRegistered()) return;

  const desktopDir = join(homedir(), ".local", "share", "applications");
  const desktopFile = join(desktopDir, DESKTOP_FILENAME);

  try {
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(desktopFile, buildDesktopEntry(appImagePath), { mode: 0o644 });

    spawnSync("xdg-mime", ["default", DESKTOP_FILENAME, "x-scheme-handler/figma"]);
    spawnSync("update-desktop-database", [desktopDir]);

    logger.info("[AppImage] Registered figma:// URL handler →", desktopFile);
  } catch (err) {
    logger.warn("[AppImage] Failed to register URL handler:", err);
  }
}
