import { expect, test } from "@playwright/test";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

/**
 * Tab drag reorder (bespoke pointer reorder — src/renderer/Panel/Components/tabReorder.ts).
 *
 * Drives the real pointer reorder with synthetic mouse input and asserts:
 *   1. mid-drag the grabbed tab is lifted (.tab-dragging present);
 *   2. on drop the visual order changes to match the drag;
 *   3. nothing is left in a dragging/transformed state after the drop
 *      (the old vendored lib could leave a tab stuck as an empty slot);
 *   4. tab cycling order (getNextTabId) follows the new visual order — i.e. the
 *      reorder was pushed to the main process, not deferred to window close.
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

const TAB_SEL = "#panel [data-tab-id]";

async function tabOrder(panel: Panel): Promise<string[]> {
  return panel.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((el) => el.getAttribute("data-tab-id") ?? "");
  }, TAB_SEL);
}

async function waitForTabs(panel: Panel, n: number) {
  for (let i = 0; i < 50; i++) {
    if ((await tabOrder(panel)).length >= n) return;
    await panel.waitForTimeout(100);
  }
  throw new Error(`strip never reached ${n} tabs`);
}

/** Bounding box of the drag handle (title area) of the tab at `index`. */
async function handleBox(panel: Panel, index: number) {
  const box = await panel.evaluate((i) => {
    const wrappers = [...document.querySelectorAll("#panel [data-tab-id]")];
    const handle = wrappers[i]?.querySelector("[data-drag-handle]");
    if (!handle) return null;
    const r = handle.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, index);
  if (!box) throw new Error(`no drag handle at index ${index}`);
  return box;
}

test.describe("Tab drag reorder", () => {
  test("reorders the strip and keeps cycling order in sync", async () => {
    const handle = await launchApp({ settings: { app: { frameStyle: "gnome" } } });
    const panel = await findPanelPage(handle.app);

    for (const url of URLS) {
      await openTab(handle.app, url);
      await panel.waitForTimeout(300);
    }
    await waitForTabs(panel, URLS.length);

    const before = await tabOrder(panel);
    expect(before.length).toBeGreaterThanOrEqual(3);

    // Drag the first tab past the last tab's centre.
    const src = await handleBox(panel, 0);
    const dst = await handleBox(panel, before.length - 1);
    const y = src.y + src.h / 2;
    const startX = src.x + src.w / 2;
    const endX = dst.x + dst.w / 2 + 10;

    await panel.mouse.move(startX, y);
    await panel.mouse.down();

    // Grabbing activates the tab immediately (browser-style) so you always drag
    // the visually-distinct active tab, not a transparent one.
    const activeOnGrab = await panel.evaluate(() => {
      const active = document.querySelector('#panel [class*="-tab--active"]');
      return active?.closest("[data-tab-id]")?.getAttribute("data-tab-id") ?? null;
    });
    expect(activeOnGrab).toBe(before[0]);

    await panel.mouse.move(startX + 8, y); // cross the threshold
    await panel.waitForTimeout(60);

    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      await panel.mouse.move(startX + ((endX - startX) * i) / steps, y);
      await panel.waitForTimeout(40);
    }

    // Mid-drag: the grabbed tab is lifted.
    const lifted = await panel.evaluate(() => document.querySelectorAll(".tab-dragging").length);
    expect(lifted, "grabbed tab should be lifted mid-drag").toBe(1);

    await panel.mouse.up();
    await panel.waitForTimeout(300);

    // The first tab moved to the end; order changed.
    const after = await tabOrder(panel);
    expect(after.length).toBe(before.length);
    expect(after).not.toEqual(before);
    expect(after[after.length - 1]).toBe(before[0]);

    // Nothing left in a dragging / transformed state (the old lib could stick).
    const residue = await panel.evaluate(() => {
      const dragging = document.querySelectorAll(".tab-dragging").length;
      const transformed = [...document.querySelectorAll("#panel [data-tab-id]")].filter(
        (el) => (el as HTMLElement).style.transform !== "",
      ).length;
      return { dragging, transformed };
    });
    expect(residue.dragging).toBe(0);
    expect(residue.transformed).toBe(0);

    // Cycling order follows the new visual order: focusing the new first tab and
    // advancing lands on the new second tab (proves the reorder reached main).
    const firstId = Number(after[0]);
    const secondId = Number(after[1]);
    await handle.app.evaluate(({ ipcMain, app: electronApp }, id) => {
      ipcMain.emit("setTabFocus", { sender: { id: -1 } }, id);
      electronApp.emit("focusNextTab");
    }, firstId);
    await panel.waitForTimeout(200);

    const activeId = await panel.evaluate(() => {
      const active = document.querySelector('#panel [class*="-tab--active"]');
      return active?.closest("[data-tab-id]")?.getAttribute("data-tab-id") ?? null;
    });
    expect(Number(activeId)).toBe(secondId);

    await closeApp(handle);
  });
});
