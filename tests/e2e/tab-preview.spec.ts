import { expect, test } from "@playwright/test";
import { closeApp, launchApp } from "./helpers/launch";

const FILE_URL_A = "https://www.figma.com/design/AAA111aaa/project-alpha";
const FILE_URL_B = "https://www.figma.com/design/BBB222bbb/project-beta";

type App = Awaited<ReturnType<typeof launchApp>>["app"];

async function openTab(app: App, url: string) {
  await app.evaluate(({ app: electronApp }, tabUrl) => {
    electronApp.emit("openUrlInNewTab", tabUrl);
  }, url);
}

async function findPage(app: App, marker: string) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const url = page.url();
      if (url.includes(marker)) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error(`page "${marker}" not found`);
}

async function findPanelPage(app: App) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

/** Number of child views attached to the first window (tab + overlays). */
const childViews = (app: App) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);

/** Bounds of the topmost child view — the preview card while it is showing. */
const topChildBounds = (app: App) =>
  app.evaluate(({ BrowserWindow }) => {
    const kids = BrowserWindow.getAllWindows()[0].contentView.children;
    return kids[kids.length - 1].getBounds();
  });

/**
 * Tab hover previews: resting the pointer on a background tab attaches the
 * preview WebContentsView under that tab with the thumbnail captured when the
 * tab lost focus; leaving detaches it. `app.tabHoverPreviews` gates all of it.
 */
test.describe("Tab hover previews", () => {
  test("shows a card with the background tab's thumbnail and hides on leave", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);

    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(700);
    // Focus moves to B: A is captured while still attached, then detached.
    await openTab(handle.app, FILE_URL_B);
    await panel.waitForTimeout(700);

    const before = await childViews(handle.app);
    const first = panel.locator("[data-tab-id]").first();
    await first.hover();
    await panel.waitForTimeout(900);

    expect(await childViews(handle.app)).toBe(before + 1);

    const preview = await findPage(handle.app, "preview.html");
    const card = await preview.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        const img = document.querySelector<HTMLImageElement>("img.shot");
        if (img?.complete && img.naturalWidth > 0) {
          return {
            title: document.querySelector(".title")?.textContent ?? "",
            src: img.src.slice(0, 22),
            naturalWidth: img.naturalWidth,
            frame: document.querySelector(".card")?.getAttribute("data-frame"),
          };
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    });
    expect(card).not.toBeNull();
    expect(card!.src).toBe("data:image/jpeg;base64");
    expect(card!.naturalWidth).toBeGreaterThan(0);
    expect(card!.frame).toBe("gnome");

    // Left-aligned with the hovered tab, right under the 40px panel.
    const anchor = (await first.boundingBox())!;
    const bounds = await topChildBounds(handle.app);
    expect(bounds.y).toBe(40);
    expect(Math.abs(bounds.x + 12 - anchor.x)).toBeLessThanOrEqual(2);

    // Leave the strip: the card goes away.
    await panel.mouse.move(700, 20);
    await panel.waitForTimeout(400);
    expect(await childViews(handle.app)).toBe(before);

    await closeApp(handle);
  });

  test("the active tab gets a text-only card", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(700);

    await panel.locator("[data-tab-id]").first().hover();
    await panel.waitForTimeout(900);
    const preview = await findPage(handle.app, "preview.html");
    await preview.waitForTimeout(200);
    const hasImage = await preview.evaluate(() => !!document.querySelector("img.shot"));
    expect(hasImage).toBe(false);
    expect(await preview.locator(".card").count()).toBe(1);

    await closeApp(handle);
  });

  test("respects the setting when turned off", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false, tabHoverPreviews: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(500);
    await openTab(handle.app, FILE_URL_B);
    await panel.waitForTimeout(500);

    const before = await childViews(handle.app);
    await panel.locator("[data-tab-id]").first().hover();
    await panel.waitForTimeout(900);
    expect(await childViews(handle.app)).toBe(before);

    await closeApp(handle);
  });

  test("follows a scaled panel", async () => {
    const handle = await launchApp({
      settings: {
        app: { frameStyle: "gnome", frameStyleAuto: false, panelHeight: 50 },
        ui: { scalePanel: 1.25 },
      },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_B);
    await panel.waitForTimeout(600);

    const first = panel.locator("[data-tab-id]").first();
    await first.hover();
    await panel.waitForTimeout(900);
    const anchor = (await first.boundingBox())!;
    const bounds = await topChildBounds(handle.app);
    expect(bounds.y).toBe(50);
    expect(Math.abs(bounds.x + 12 - anchor.x)).toBeLessThanOrEqual(2);

    await closeApp(handle);
  });
});
