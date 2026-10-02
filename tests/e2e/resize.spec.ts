import { expect, test } from "@playwright/test";
import { expectShown, findPanelPage, openTab, shownView, stripTabs } from "./helpers/app";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

const FILE_URLS = [
  "https://www.figma.com/design/AAA111aaa/alpha",
  "https://www.figma.com/design/BBB222bbb/beta",
  "https://www.figma.com/design/CCC333ccc/gamma",
];

/** Resize the window and emit `resize` (bare xvfb has no WM to do it reliably). */
async function resizeTo(app: AppHandle["app"], width: number, height = 800) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setBounds({ x: 100, y: 100, width: w, height: h });
      win.emit("resize");
    },
    { w: width, h: height },
  );
}

/**
 * Width of the file view on screen next to the window's content width.
 * Main's side of it: view bounds, not the page's innerWidth, which lags
 * behind under xvfb.
 */
function shownFileWidth(app: AppHandle["app"]) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const kids = win.contentView.children as Electron.WebContentsView[];
    const view = kids.find((v) => v.getVisible() && v.webContents.getURL().includes("/design/"));
    return { window: win.getContentSize()[0], view: view?.getBounds().width ?? -1 };
  });
}

test.describe("Tab bounds on resize", () => {
  test("the tab on screen follows the window", async () => {
    const handle = await launchApp();
    await openTab(handle.app, FILE_URLS[0]);
    await expectShown(handle, "AAA111aaa");

    await resizeTo(handle.app, 1111);

    await expect.poll(() => shownFileWidth(handle.app)).toEqual({ window: 1111, view: 1111 });
    await closeApp(handle);
  });

  // Resizing only re-lays out the tab on screen; a background tab gets its
  // bounds when it is switched to. Forget that and it comes back at the old size.
  test("a background tab switched to after resizes fits the new size, nothing leaks", async () => {
    const handle = await launchApp();
    const panel = await findPanelPage(handle.app);
    for (const url of FILE_URLS) await openTab(handle.app, url);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(3);
    const pagesBefore = await handle.app.evaluate(
      ({ webContents }) => webContents.getAllWebContents().length,
    );

    for (let i = 0; i < 50; i++) await resizeTo(handle.app, i % 2 === 0 ? 1000 : 1400);
    await expect.poll(() => shownFileWidth(handle.app)).toEqual({ window: 1400, view: 1400 });

    const [first] = await stripTabs(panel);
    await panel.locator(`[data-tab-id="${first.id}"] [data-drag-handle]`).click();
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    await expect.poll(() => shownFileWidth(handle.app)).toEqual({ window: 1400, view: 1400 });

    expect(
      await handle.app.evaluate(({ webContents }) => webContents.getAllWebContents().length),
    ).toBe(pagesBefore);

    await closeApp(handle);
  });
});
