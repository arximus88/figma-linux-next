import { expect, test } from "@playwright/test";
import { findPanelPage, openTab, shownView, stripTabs } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

const A = "https://www.figma.com/design/AAA111aaa/project-alpha";
const B = "https://www.figma.com/design/BBB222bbb/project-beta";
const C = "https://www.figma.com/design/CCC333ccc/project-gamma";

const ids = async (panel: Awaited<ReturnType<typeof findPanelPage>>) =>
  (await stripTabs(panel)).map((t) => t.id);
const activeId = async (panel: Awaited<ReturnType<typeof findPanelPage>>) =>
  (await stripTabs(panel)).find((t) => t.active)?.id;

test.describe("Tab management", () => {
  test("each file gets its own tab, and the newest one is on screen", async () => {
    const handle = await launchApp();
    const panel = await findPanelPage(handle.app);

    for (const url of [A, B, C]) await openTab(handle.app, url);

    await expect.poll(async () => (await ids(panel)).length).toBe(3);
    const [, , c] = await ids(panel);
    await expect.poll(() => activeId(panel)).toBe(c);
    await expect.poll(() => shownView(handle.app)).toContain("CCC333ccc");

    await closeApp(handle);
  });

  test("opening a file that is already open switches to its tab", async () => {
    const handle = await launchApp();
    const panel = await findPanelPage(handle.app);

    await openTab(handle.app, A);
    await openTab(handle.app, B);
    await expect.poll(async () => (await ids(panel)).length).toBe(2);
    const [a] = await ids(panel);

    // Same file key, different path and query — still the same file.
    await openTab(handle.app, "https://www.figma.com/design/AAA111aaa/renamed?node-id=1-2");

    await expect.poll(() => activeId(panel)).toBe(a);
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    expect(await ids(panel)).toHaveLength(2);

    await closeApp(handle);
  });

  test("closing the active tab shows a neighbour and frees its page", async () => {
    const handle = await launchApp();
    const panel = await findPanelPage(handle.app);

    for (const url of [A, B, C]) await openTab(handle.app, url);
    await expect.poll(async () => (await ids(panel)).length).toBe(3);
    const [a, b, c] = await ids(panel);

    // Focus the middle tab, then close it with its × like a user would.
    await panel.locator(`[data-tab-id="${b}"] [data-drag-handle]`).click();
    await expect.poll(() => activeId(panel)).toBe(b);
    await panel
      .locator(`[data-tab-id="${b}"]`)
      .getByRole("button", { name: /^Close/ })
      .click();

    await expect.poll(() => ids(panel)).toEqual([a, c]);
    // Exactly one view on screen, and it is one of the remaining files.
    await expect.poll(() => shownView(handle.app)).toMatch(/AAA111aaa|CCC333ccc/);
    const shownIsActive = await shownView(handle.app);
    const active = await activeId(panel);
    expect(shownIsActive).toContain(active === a ? "AAA111aaa" : "CCC333ccc");
    // The closed tab's page is gone, not just hidden.
    const leaked = await handle.app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().some((wc) => wc.getURL().includes("BBB222bbb")),
    );
    expect(leaked).toBe(false);

    await closeApp(handle);
  });
});
