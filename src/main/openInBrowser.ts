import { shell } from "electron";

import { logger } from "./Logger";

/**
 * Hand a URL to the system browser and leave a trace either way.
 *
 * `shell.openExternal` goes through xdg-open; when that fails (no default
 * browser, a browser that refuses the URL, a portal error under Flatpak) the
 * promise rejects and, un-awaited, nothing is logged — the user clicks
 * "Log in" in a plugin and simply nothing happens (#41). Only origin and path
 * are logged: OAuth links carry state and codes in the query.
 */
export function openInBrowser(url: string, source: string): Promise<boolean> {
  const shown = describeUrl(url);
  logger.info(`[${source}] opening in browser: ${shown}`);

  return Promise.resolve()
    .then(() => shell.openExternal(url))
    .then(
      () => true,
      (error) => {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(`[${source}] could not open ${shown} in the browser: ${reason}`);
        return false;
      },
    );
}

function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<unparseable url>";
  }
}
