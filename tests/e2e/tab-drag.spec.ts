import { expect, test } from "@playwright/test";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

/**
 * Tab drag-and-drop reorder.
 *
 * Drives the real pointer-based DnD (svelte-dnd-action) with synthetic mouse
 * events and asserts the two things the "live reorder" fix restored:
 *   1. mid-drag a visible placeholder slot exists with a non-zero footprint
 *      (the regression: the shadow item used to be collapsed to width:0, so the
 *      other tabs closed ranks with no indication of the drop target);
 *   2. on drop the tab order actually changes.
 *
 * Animation *smoothness* (FLIP) is not assertable here; presence + footprint of
 * the placeholder and the reorder outcome are.
 */

const URLS = [
  "https://www.figma.com/design/AAA111aaa/alpha",
  "https://www.figma.com/design/BBB222bbb/beta",
  "https://www.figma.com/design/CCC333ccc/gamma",
];

async function openTab(app: AppHandle["app"], url: string) {
  await app.evaluate(({ app: electronApp }, tabUrl) => {
    electronApp.emit("openUrlInNewTab", tabUrl);
  }, url);
}

/** The panel page hosts #panel; app.firstWindow() is not reliably it. */
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

const TAB_SEL = "#panel [data-tab-id]:not([data-is-dnd-shadow-item])";

/** Ordered list of tab ids currently rendered in the strip (shadow excluded). */
async function tabOrder(panel: Panel): Promise<string[]> {
  return panel.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((el) => el.getAttribute("data-tab-id") ?? "");
  }, TAB_SEL);
}

/** Wait until at least `n` tab chips are present. */
async function waitForTabs(panel: Panel, n: number) {
  for (let i = 0; i < 50; i++) {
    if ((await tabOrder(panel)).length >= n) return;
    await panel.waitForTimeout(100);
  }
  throw new Error(`strip never reached ${n} tabs`);
}

test.describe("Tab drag reorder", () => {
  test("dragging a tab shows a placeholder slot and reorders the strip", async () => {
    const handle = await launchApp({ settings: { app: { frameStyle: "gnome" } } });
    const panel = await findPanelPage(handle.app);

    for (const url of URLS) {
      await openTab(handle.app, url);
      await panel.waitForTimeout(300);
    }
    // file tabs + the always-present New file tab
    await waitForTabs(panel, URLS.length);

    const before = await tabOrder(panel);
    expect(before.length).toBeGreaterThanOrEqual(3);

    // Drag the first chip toward the last chip's position.
    const boxes = await panel.evaluate((sel) => {
      return [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
    }, TAB_SEL);

    const src = boxes[0];
    const dst = boxes[boxes.length - 1];
    const y = src.y + src.h / 2;
    const startX = src.x + src.w / 2;
    const endX = dst.x + dst.w / 2;

    await panel.mouse.move(startX, y);
    await panel.mouse.down();
    // Cross the ~3px drag-start threshold, then step toward the target. Y stays
    // fixed (the dnd config locks the Y axis for the horizontal strip).
    await panel.mouse.move(startX + 8, y);
    await panel.waitForTimeout(120);

    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      await panel.mouse.move(startX + ((endX - startX) * i) / steps, y);
      await panel.waitForTimeout(80);
    }

    // Mid-drag: the placeholder slot must exist and occupy real width.
    const shadow = await panel.evaluate(() => {
      const el = document.querySelector("#panel [data-is-dnd-shadow-item]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(shadow, "placeholder shadow element should be present mid-drag").not.toBeNull();
    expect(shadow!.w, "placeholder slot should have a non-zero width").toBeGreaterThan(4);

    await panel.mouse.up();
    await panel.waitForTimeout(300);

    const after = await tabOrder(panel);
    // Same set of tabs, different sequence — the dragged (first) tab moved right.
    expect(after.length).toBe(before.length);
    expect(after).not.toEqual(before);
    expect(after[0]).not.toBe(before[0]);

    await closeApp(handle);
  });
});
