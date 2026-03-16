import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

const FILE_URL_A = "https://www.figma.com/design/AAA111aaa/project-alpha";
const FILE_URL_B = "https://www.figma.com/design/BBB222bbb/project-beta";

/**
 * Open a tab via the main-process openUrlInNewTab event (same path as HomeTab clicks).
 */
async function openTab(app: Awaited<ReturnType<typeof launchApp>>["app"], url: string) {
  await app.evaluate(
    ({ app: electronApp }, tabUrl) => {
      electronApp.emit("openUrlInNewTab", tabUrl);
    },
    url,
  );
}

/**
 * Returns the number of webContents currently alive (panel + mainTab + settingsView + open tabs).
 * Use deltas between calls to measure tab additions/removals.
 */
async function getWebContentsCount(app: Awaited<ReturnType<typeof launchApp>>["app"]): Promise<number> {
  return app.evaluate(({ webContents }) => webContents.getAllWebContents().length);
}

test.describe("Tab management", () => {
  test("opens a new tab for a file URL", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(800);

    const before = await getWebContentsCount(handle.app);
    await openTab(handle.app, FILE_URL_A);
    await handle.panel.waitForTimeout(600);

    const after = await getWebContentsCount(handle.app);
    expect(after).toBeGreaterThan(before);

    await closeApp(handle);
  });

  test("does not create duplicate tab for same file key", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(800);

    await openTab(handle.app, FILE_URL_A);
    await handle.panel.waitForTimeout(600);
    const afterFirst = await getWebContentsCount(handle.app);

    // Open same file again — should focus existing, not add new webContents
    await openTab(handle.app, FILE_URL_A);
    await handle.panel.waitForTimeout(600);
    const afterSecond = await getWebContentsCount(handle.app);

    expect(afterSecond).toBe(afterFirst);

    await closeApp(handle);
  });

  test("opens separate tabs for different file keys", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(800);

    await openTab(handle.app, FILE_URL_A);
    await handle.panel.waitForTimeout(500);
    const afterFirst = await getWebContentsCount(handle.app);

    await openTab(handle.app, FILE_URL_B);
    await handle.panel.waitForTimeout(500);
    const afterSecond = await getWebContentsCount(handle.app);

    expect(afterSecond).toBeGreaterThan(afterFirst);

    await closeApp(handle);
  });

  test("can open multiple different tabs", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(800);

    const base = await getWebContentsCount(handle.app);

    const urls = [
      "https://www.figma.com/design/AAA111aaa/alpha",
      "https://www.figma.com/design/BBB222bbb/beta",
      "https://www.figma.com/design/CCC333ccc/gamma",
    ];

    for (const url of urls) {
      await openTab(handle.app, url);
      await handle.panel.waitForTimeout(400);
    }

    const count = await getWebContentsCount(handle.app);
    expect(count).toBeGreaterThanOrEqual(base + 3);

    await closeApp(handle);
  });

  test("closes a tab without crashing", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(800);

    await openTab(handle.app, FILE_URL_A);
    await handle.panel.waitForTimeout(500);
    const afterOpen = await getWebContentsCount(handle.app);

    // Close via the panel's closeTab IPC (the same path the UI uses)
    await handle.app.evaluate(({ ipcMain }) => {
      ipcMain.emit("closeTab");
    });
    await handle.panel.waitForTimeout(500);

    // App still alive
    expect(handle.app.windows().length).toBeGreaterThanOrEqual(1);

    // After closing, webContents count should not grow further
    const afterClose = await getWebContentsCount(handle.app);
    expect(afterClose).toBeLessThanOrEqual(afterOpen);

    await closeApp(handle);
  });
});
