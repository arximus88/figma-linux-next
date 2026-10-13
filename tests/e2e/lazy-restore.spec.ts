import { expect, test } from "@playwright/test";
import { findPanelPage, shownView, stripTabs } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

const urls = ["AAA111aaa", "BBB222bbb", "CCC333ccc"].map(
  (key) => `https://www.figma.com/design/${key}/memory-test`,
);

test("lazy restore creates only the eager view and loads a shell on click", async () => {
  const handle = await launchApp({
    settings: {
      app: {
        saveLastOpenedTabs: true,
        lazyRestoreTabs: true,
        lazyRestoreEagerCount: 1,
        windowsState: {
          1: {
            x: 0,
            y: 0,
            width: 1000,
            height: 700,
            isMaximized: false,
            userId: "",
            hasOpenedCommunityTab: false,
            lastActiveTabPath: "/design/BBB222bbb/memory-test",
            lastActiveTabIndex: 1,
            recentTabIndices: [1, 0, 2],
            tabs: urls.map((url, i) => ({ url, title: `File ${i + 1}` })),
            tabGroups: [],
          },
        },
      },
    },
  });
  try {
    const panel = await findPanelPage(handle.app);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(3);
    const before = await stripTabs(panel);
    await expect.poll(() => shownView(handle.app)).toContain("BBB222bbb");
    const liveFiles = () =>
      handle.app.evaluate(
        ({ webContents }) =>
          webContents.getAllWebContents().filter((wc) => wc.getURL().includes("/design/")).length,
      );
    await expect.poll(liveFiles).toBe(1);
    await panel.locator(`[data-tab-id="${before[0].id}"] [data-drag-handle]`).click();
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    await expect.poll(liveFiles).toBe(2);
    expect((await stripTabs(panel)).map((t) => t.id)).toEqual(before.map((t) => t.id));
  } finally {
    await closeApp(handle);
  }
});
