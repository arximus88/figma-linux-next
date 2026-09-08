import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isDev } from "Utils/Common";
import { logger } from "./Logger";

export const APPIMAGE_DESKTOP = "figma-linux-next-appimage.desktop";
export const LOCAL_DESKTOP = "figma-linux-next-local.desktop";

export interface HandlerPlan {
  filename: string;
  exec: string;
}

export interface HandlerEnv {
  /** `xdg-mime query default x-scheme-handler/figma`, trimmed. */
  current: string;
  appImage?: string;
  execPath: string;
  flatpak: boolean;
  dev: boolean;
}

/**
 * Decide whether this launch must write a .desktop entry for figma://.
 *
 * Packages (deb/rpm/pacman/nix/Flatpak) ship their own entry and the package
 * manager registers it, so a launch from any of those sees a handler and does
 * nothing. Two launches have no package behind them:
 *
 * - an AppImage, which may live anywhere and move — it always owns the
 *   handler through its own entry, rewritten whenever the path changes;
 * - a bare binary (`nix run`, an unpacked release zip), which registers a
 *   "local" entry only when *no* handler exists at all, so it never steals
 *   the scheme from an installed package.
 *
 * Without a handler "Log in with browser" never comes back to the app, and
 * nothing tells the user why.
 */
export function planUrlHandler(env: HandlerEnv): HandlerPlan | null {
  if (env.flatpak || env.dev) return null;
  if (env.appImage) {
    return env.current === APPIMAGE_DESKTOP
      ? null
      : { filename: APPIMAGE_DESKTOP, exec: env.appImage };
  }
  if (env.current !== "") return null;
  return { filename: LOCAL_DESKTOP, exec: env.execPath };
}

export function buildDesktopEntry(exec: string): string {
  return `${[
    "[Desktop Entry]",
    "Name=Figma Linux Next",
    "Comment=Unofficial Figma desktop app for Linux",
    `Exec=${exec} %U`,
    "Terminal=false",
    "Type=Application",
    "Icon=figma-linux-next",
    "StartupWMClass=figma-linux-next",
    "Categories=Graphics;",
    "MimeType=application/figma;x-scheme-handler/figma;",
  ].join("\n")}\n`;
}

function currentHandler(): string {
  const result = spawnSync("xdg-mime", ["query", "default", "x-scheme-handler/figma"], {
    encoding: "utf8",
  });
  return result.stdout?.trim() ?? "";
}

/** Make sure figma:// reaches this app. See planUrlHandler for the rules. */
export function registerUrlHandler(): void {
  const plan = planUrlHandler({
    current: currentHandler(),
    appImage: process.env.APPIMAGE,
    execPath: process.execPath,
    flatpak: !!process.env.FLATPAK_ID,
    dev: isDev,
  });
  if (!plan) return;

  const desktopDir = join(homedir(), ".local", "share", "applications");
  const desktopFile = join(desktopDir, plan.filename);

  try {
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(desktopFile, buildDesktopEntry(plan.exec), { mode: 0o644 });

    spawnSync("xdg-mime", ["default", plan.filename, "x-scheme-handler/figma"]);
    spawnSync("update-desktop-database", [desktopDir]);

    logger.info("[UrlHandler] Registered figma:// →", desktopFile);
  } catch (err) {
    logger.warn("[UrlHandler] Failed to register figma:// handler:", err);
  }
}
