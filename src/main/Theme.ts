import { execFile } from "node:child_process";
import { nativeTheme } from "electron";

import { storage } from "Main/Storage";
import { logger } from "Main/Logger";

/**
 * Figma reports its Theme menu choice through the desktop bridge as
 * "dark" | "light" | "system". The panel needs a concrete colour scheme, so
 * "system" is resolved here.
 *
 * Chromium's nativeTheme on Linux only looks at the GTK theme *name* (dark if
 * it contains "dark"), so a light GTK theme with the desktop's "prefer dark"
 * switch on — the stock GNOME setup with adw-gtk3 — comes out light. The
 * freedesktop settings portal carries the real preference on GNOME, Plasma and
 * inside Flatpak alike, so it is asked first (via gdbus, no D-Bus binding in
 * Electron) and nativeTheme is only the fallback when the portal is absent or
 * reports "no preference".
 */
let portalPrefersDark: boolean | null = null;

/** 1 = prefer dark, 2 = prefer light, 0 / anything else = no preference. */
export function parsePortalColorScheme(output: string): boolean | null {
  const m = /uint32 (\d+)/.exec(output);
  if (!m) return null;
  const value = Number(m[1]);
  if (value === 1) return true;
  if (value === 2) return false;
  return null;
}

/** Re-read the portal preference. Resolves to true when the answer changed. */
export function refreshSystemTheme(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.freedesktop.portal.Desktop",
        "--object-path",
        "/org/freedesktop/portal/desktop",
        "--method",
        "org.freedesktop.portal.Settings.ReadOne",
        "org.freedesktop.appearance",
        "color-scheme",
      ],
      { timeout: 2000 },
      (error, stdout) => {
        if (error) {
          logger.debug("[theme] settings portal unavailable, using nativeTheme:", error.message);
          resolve(false);
          return;
        }
        const next = parsePortalColorScheme(String(stdout));
        const changed = next !== portalPrefersDark;
        portalPrefersDark = next;
        resolve(changed);
      },
    );
  });
}

export function systemPrefersDark(): boolean {
  return portalPrefersDark ?? nativeTheme.shouldUseDarkColors;
}

export function resolveFigmaTheme(pref: unknown): Types.ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return systemPrefersDark() ? "dark" : "light";
}

export function getResolvedFigmaTheme(): Types.ResolvedTheme {
  return resolveFigmaTheme(storage.settings.app.figmaTheme);
}

export function isFigmaThemePreference(value: unknown): value is Types.FigmaThemePreference {
  return value === "dark" || value === "light" || value === "system";
}
