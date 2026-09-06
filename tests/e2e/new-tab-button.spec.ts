import { expect, test } from "@playwright/test";
import { closeApp, launchApp } from "./helpers/launch";

const FILE_URL_A = "https://www.figma.com/design/AAA111aaa/project-alpha";
const FILE_URL_B = "https://www.figma.com/design/BBB222bbb/project-beta";

async function openTab(app: Awaited<ReturnType<typeof launchApp>>["app"], url: string) {
  await app.evaluate(({ app: electronApp }, tabUrl) => {
    electronApp.emit("openUrlInNewTab", tabUrl);
  }, url);
}

async function findPanelPage(app: Awaited<ReturnType<typeof launchApp>>["app"]) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

/** Titles of the strip's tabs, left to right (skeletons read as ""). */
async function tabTitles(panel: Awaited<ReturnType<typeof findPanelPage>>) {
  return panel.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
      (el) => el.querySelector("[data-drag-handle] span:last-child")?.textContent?.trim() ?? "",
    ),
  );
}

/**
 * `app.newTabButtonAfterTabs`: the "+" moves from the left corner to right after
 * the last tab, and the New file tab it opens is pinned last instead of first.
 */
test.describe("New tab button placement", () => {
  test("default: '+' in the left corner, New file tab opens first", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);

    expect(await panel.locator(".left .new-tab-btn").count()).toBe(1);
    expect(await panel.locator(".tabs .strip-plus").count()).toBe(0);

    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(400);
    await handle.app.evaluate(({ app: electronApp }) => electronApp.emit("newFile"));
    await panel.waitForTimeout(600);

    const titles = await tabTitles(panel);
    expect(titles.length).toBe(2);
    expect(titles[0]).toBe("New file");
    // The button hides while the New file tab is open.
    expect(await panel.locator(".left .new-tab-btn").count()).toBe(0);

    await closeApp(handle);
  });

  test("after-tabs: '+' follows the strip, New file tab opens last", async () => {
    const handle = await launchApp({
      settings: {
        app: { frameStyle: "gnome", frameStyleAuto: false, newTabButtonAfterTabs: true },
      },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);

    expect(await panel.locator(".left .new-tab-btn").count()).toBe(0);
    expect(await panel.locator(".tabs .strip-plus .new-tab-btn").count()).toBe(1);

    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(400);
    await openTab(handle.app, FILE_URL_B);
    await panel.waitForTimeout(400);

    // The button sits right after the last tab: its left edge is at (or past)
    // the last tab's right edge, on the same row.
    const geometry = await panel.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>("[data-tab-id]")];
      const last = tabs[tabs.length - 1].getBoundingClientRect();
      const plus = document.querySelector<HTMLElement>(".strip-plus")!.getBoundingClientRect();
      return { lastRight: last.right, plusLeft: plus.left, plusWidth: plus.width };
    });
    expect(geometry.plusWidth).toBeGreaterThan(0);
    expect(geometry.plusLeft).toBeGreaterThanOrEqual(geometry.lastRight - 1);
    expect(geometry.plusLeft - geometry.lastRight).toBeLessThan(24);

    await handle.app.evaluate(({ app: electronApp }) => electronApp.emit("newFile"));
    await panel.waitForTimeout(600);

    const titles = await tabTitles(panel);
    expect(titles.length).toBe(3);
    expect(titles[titles.length - 1]).toBe("New file");
    expect(await panel.locator(".tabs .strip-plus").count()).toBe(0);

    await closeApp(handle);
  });

  test("flipping the setting live moves the button and re-pins the New file tab", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);

    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(400);
    await handle.app.evaluate(({ app: electronApp }) => electronApp.emit("newFile"));
    await panel.waitForTimeout(600);
    expect((await tabTitles(panel))[0]).toBe("New file");

    // The payload SettingsController broadcasts to every panel after the
    // Settings modal closes with the toggle flipped.
    await handle.app.evaluate(({ webContents }) => {
      const panelWc = webContents
        .getAllWebContents()
        .find((wc) => wc.getURL().includes("index.html"));
      panelWc?.send("loadSettings", {
        ui: { scalePanel: 1 },
        app: { hideWindowMinMaxButtons: false, newTabButtonAfterTabs: true },
      });
    });
    await panel.waitForTimeout(400);

    const titles = await tabTitles(panel);
    expect(titles[titles.length - 1]).toBe("New file");
    // The New file tab is open, so no "+" anywhere; close it and the "+" shows up in the strip.
    expect(await panel.locator(".new-tab-btn").count()).toBe(0);

    await closeApp(handle);
  });
});
