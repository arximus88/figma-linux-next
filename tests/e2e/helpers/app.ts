import type { Page } from "@playwright/test";
import type { AppHandle } from "./launch";

type App = AppHandle["app"];

/** Open a Figma URL the way a figma:// link or the home tab does. */
export async function openTab(app: App, url: string) {
  await app.evaluate(({ app: electronApp }, tabUrl) => {
    electronApp.emit("openUrlInNewTab", tabUrl);
  }, url);
}

/** The page hosting the panel (#panel); app.firstWindow() is not reliably it. */
export async function findPanelPage(app: App): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

export interface StripTab {
  id: number;
  title: string;
  active: boolean;
}

/** File tabs in the strip, left to right, as the user sees them. */
export function stripTabs(panel: Page): Promise<StripTab[]> {
  return panel.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#panel [data-tab-id]")].map((el) => ({
      id: Number(el.dataset.tabId),
      title: el.querySelector("[data-drag-handle] span:last-child")?.textContent?.trim() ?? "",
      active: !!el.querySelector('[class*="-tab--active"]'),
    })),
  );
}

/**
 * URL of the view filling the tab area. Views stay attached and are toggled
 * with setVisible, so this reads the views' own flag — under xvfb a hidden
 * page still reports document.visibilityState "visible". The hover card is
 * not a tab and is skipped. Several visible views is a bug, reported as such.
 */
export function shownView(app: App): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => {
    const kids = BrowserWindow.getAllWindows()[0].contentView
      .children as Electron.WebContentsView[];
    const shown = kids
      .filter((v) => v.getVisible() && !v.webContents.getURL().includes("preview.html"))
      .map((v) => v.webContents.getURL());
    return shown.length === 1 ? shown[0] : `${shown.length} views shown: ${shown.join(" | ")}`;
  });
}

/**
 * Open Settings (as the menu does) and return its page once it is shown —
 * shown, not just loaded: a hidden view runs no animation frames, and
 * Playwright waits on one before every click.
 */
export async function openSettings(handle: AppHandle): Promise<Page> {
  await handle.app.evaluate(({ app }) => {
    app.emit("openSettingsView");
  });
  for (let i = 0; i < 30; i++) {
    const page = handle.app.windows().find((p) => p.url().includes("settings.html"));
    if (page) {
      await page.getByRole("switch").first().waitFor({ state: "attached" });
      return page;
    }
    await handle.panel.waitForTimeout(100);
  }
  throw new Error("settings page not found");
}
