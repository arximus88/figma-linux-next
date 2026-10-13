import { expect, test } from "@playwright/test";
import { findPanelPage, openTab, shownView, stripTabs } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

const urls = ["AAA111aaa", "BBB222bbb", "CCC333ccc"].map(
  (key) => `https://www.figma.com/design/${key}/memory-test`,
);

test("memory budget destroys the oldest background view and revives its existing tab", async () => {
  const handle = await launchApp();
  try {
    const panel = await findPanelPage(handle.app);
    for (const url of urls) await openTab(handle.app, url);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(3);
    await expect.poll(() => shownView(handle.app)).toContain("CCC333ccc");
    const before = await stripTabs(panel);
    // Use real renderer PIDs with deterministic samples, without allocating
    // gigabytes just to exercise the app's eviction path.
    await handle.app.evaluate(({ app, webContents }) => {
      const original = app.getAppMetrics;
      (globalThis as any).__restoreMetrics = () => {
        app.getAppMetrics = original;
      };
      app.getAppMetrics = () =>
        webContents
          .getAllWebContents()
          .filter((wc) => wc.getURL().includes("/design/"))
          .map((wc) => ({
            pid: wc.getOSProcessId(),
            memory: { workingSetSize: 600 * 1024 },
          })) as any;
    });
    await panel.evaluate(async () => {
      const settings = await window.figmaApi.invoke("getSettings");
      settings.app.autoDiscardTabs = true;
      settings.app.discardMemoryBudgetMB = 1024;
      await window.figmaApi.invoke("updateSettings", settings);
    });
    await expect
      .poll(() =>
        handle.app.evaluate(({ webContents }) =>
          webContents.getAllWebContents().some((wc) => wc.getURL().includes("AAA111aaa")),
        ),
      )
      .toBe(false);
    expect((await stripTabs(panel)).map((t) => t.id)).toEqual(before.map((t) => t.id));
    await expect.poll(() => shownView(handle.app)).toContain("CCC333ccc");
    await handle.app.evaluate(() => (globalThis as any).__restoreMetrics());
    await panel.locator(`[data-tab-id="${before[0].id}"] [data-drag-handle]`).click();
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    expect((await stripTabs(panel)).find((t) => t.active)?.id).toBe(before[0].id);
  } finally {
    await closeApp(handle);
  }
});
