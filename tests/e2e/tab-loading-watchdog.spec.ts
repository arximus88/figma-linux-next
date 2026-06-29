import { expect, test } from "@playwright/test";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

/**
 * Stuck-loading watchdog.
 *
 * A Figma tab's loading skeleton is normally cleared by the Figma SPA's
 * setLoading(false) signal. When that signal never arrives the tab used to stay
 * in the skeleton forever (only a manual reload fixed it). Window.armLoadingWatchdog
 * is a safety net: after the page finishes loading it waits a grace window and
 * then force-clears the loading state.
 *
 * The e2e figma.com stub never runs Figma's bridge, so it never sends
 * setLoading — i.e. it reproduces the stuck condition exactly. With a short
 * watchdog grace (FIGMA_LOADING_WATCHDOG_MS) the tab's data-loading must flip
 * from "true" to "false" on its own.
 */

const FILE_URL = "https://www.figma.com/design/AAA111aaa/project-alpha";
const TAB_SEL = "#panel [data-tab-id]:not([data-is-dnd-shadow-item])";

async function openTab(app: AppHandle["app"], url: string) {
  await app.evaluate(({ app: electronApp }, tabUrl) => {
    electronApp.emit("openUrlInNewTab", tabUrl);
  }, url);
}

async function findPanelPage(app: AppHandle["app"]) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

type Panel = Awaited<ReturnType<typeof findPanelPage>>;

/** data-loading of the most-recently-added file tab chip, or null if absent. */
async function tabLoading(panel: Panel): Promise<string | null> {
  return panel.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    const last = els[els.length - 1];
    return last ? last.getAttribute("data-loading") : null;
  }, TAB_SEL);
}

test.describe("Tab loading watchdog", () => {
  test("force-clears a stuck loading skeleton after the grace window", async () => {
    // Short grace so the test doesn't wait the production 8s.
    process.env.FIGMA_LOADING_WATCHDOG_MS = "1000";
    let handle: AppHandle;
    try {
      handle = await launchApp({ settings: { app: { frameStyle: "gnome" } } });
    } finally {
      delete process.env.FIGMA_LOADING_WATCHDOG_MS;
    }

    const panel = await findPanelPage(handle.app);

    await openTab(handle.app, FILE_URL);

    // The Figma tab starts in the loading state (skeleton).
    await expect.poll(() => tabLoading(panel), { timeout: 4000 }).toBe("true");

    // The stub never signals readiness; the watchdog must clear it on its own.
    await expect.poll(() => tabLoading(panel), { timeout: 8000 }).toBe("false");

    await closeApp(handle);
  });
});
