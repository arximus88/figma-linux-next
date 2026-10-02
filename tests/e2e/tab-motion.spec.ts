import { expect, test } from "@playwright/test";
import { closeApp, launchApp } from "./helpers/launch";

const FILE_URL_A = "https://www.figma.com/design/AAA111aaa/project-alpha";

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

/**
 * Tab open/close motion (Panel/Components/motion.ts). A freshly added tab must
 * be mid-animation right after it appears and settle to its natural space; a
 * closing tab must linger for the fold animation before it leaves the DOM.
 */
test.describe("Tab open/close motion", () => {
  test("a new tab unfolds and a closed tab folds away", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);

    await openTab(handle.app, FILE_URL_A);
    // Poll fast: the wrapper appears asynchronously, and we want to catch it
    // while its intro is still running (200 ms on the GNOME frame).
    const during = await panel.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const el = document.querySelector<HTMLElement>("[data-tab-id]");
        if (el) {
          const anims = el.getAnimations();
          return {
            animating: anims.length > 0,
            marginRight: Number.parseFloat(getComputedStyle(el).marginRight),
            clipPath: getComputedStyle(el).clipPath,
          };
        }
        await new Promise((r) => setTimeout(r, 5));
      }
      return null;
    });
    expect(during).not.toBeNull();
    expect(during!.animating).toBe(true);
    // Still unfolding: the right edge is clipped, not the default.
    expect(during!.clipPath).not.toBe("none");

    await panel.waitForTimeout(500);
    const settled = await panel.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-tab-id]")!;
      return {
        animating: el.getAnimations().length > 0,
        marginRight: Number.parseFloat(getComputedStyle(el).marginRight),
        clipPath: getComputedStyle(el).clipPath,
        opacity: getComputedStyle(el).opacity,
      };
    });
    expect(settled.animating).toBe(false);
    expect(settled.clipPath).toBe("none");
    expect(settled.opacity).toBe("1");
    // The box keeps its width; the space it takes is what unfolds (negative
    // right margin shrinking to 0).
    expect(during!.marginRight).toBeLessThan(0);
    expect(settled.marginRight).toBe(0);

    // Close it: the wrapper stays for the fold, then leaves.
    const tabId = await panel.evaluate(() =>
      Number(document.querySelector<HTMLElement>("[data-tab-id]")!.dataset.tabId),
    );
    await handle.app.evaluate(({ app: electronApp }, id) => {
      // The tab menu's Close: main removes the tab and echoes tabWasClosed.
      electronApp.emit("closeTab", undefined, id);
    }, tabId);
    const folding = await panel.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const el = document.querySelector<HTMLElement>("[data-tab-id]");
        if (!el) return { present: false, animating: false };
        if (el.getAnimations().length > 0) return { present: true, animating: true };
        await new Promise((r) => setTimeout(r, 5));
      }
      return { present: true, animating: false };
    });
    expect(folding.present).toBe(true);
    expect(folding.animating).toBe(true);
    await panel.waitForTimeout(500);
    expect(await panel.evaluate(() => document.querySelectorAll("[data-tab-id]").length)).toBe(0);

    await closeApp(handle);
  });
});
