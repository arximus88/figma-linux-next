import { nativeTheme } from "electron";

import { storage } from "Main/Storage";

/**
 * Figma reports its Theme menu choice through the desktop bridge as
 * "dark" | "light" | "system". The panel needs a concrete colour scheme, so
 * "system" is resolved here against Chromium's view of the OS preference —
 * the same source Figma's own canvas uses for its System option, which keeps
 * the panel and the document in step.
 */
export function resolveFigmaTheme(pref: unknown): Types.ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function getResolvedFigmaTheme(): Types.ResolvedTheme {
  return resolveFigmaTheme(storage.settings.app.figmaTheme);
}

export function isFigmaThemePreference(value: unknown): value is Types.FigmaThemePreference {
  return value === "dark" || value === "light" || value === "system";
}
