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

/**
 * Tab open/close motion (Panel/Components/motion.ts). A freshly added tab must
 * be mid-animation right after it appears and settle to its natural space; a
 * closing tab must linger for the fold animation before it leaves the DOM. The
 * timing tokens come from the frame, so each frame is checked for its value.
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
    await handle.app.evaluate(({ ipcMain, app: electronApp }, id) => {
      // Same path the panel uses; the main process removes it and echoes tabWasClosed.
      const win = electronApp.emit("closeTab", undefined, id);
      void win;
      void ipcMain;
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

  // The bundler minifies "150ms" to ".15s"; compare in milliseconds.
  const toMs = (v: string) =>
    v.trim().endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;

  for (const [style, expected] of [
    ["gnome", 200],
    ["kde", 150],
    ["windows", 150],
  ] as const) {
    test(`${style} frame publishes --motion-open: ${expected}ms`, async () => {
      const handle = await launchApp({
        settings: { app: { frameStyle: style, frameStyleAuto: false } },
      });
      const panel = await findPanelPage(handle.app);
      for (let i = 0; i < 50; i++) {
        const df = await panel.evaluate(
          () => document.querySelector("#panel")?.getAttribute("data-frame") ?? null,
        );
        if (df === style) break;
        await panel.waitForTimeout(100);
      }
      const token = await panel.evaluate(() =>
        getComputedStyle(document.querySelector("#panel")!)
          .getPropertyValue("--motion-open")
          .trim(),
      );
      expect(toMs(token)).toBe(expected);
      await closeApp(handle);
    });
  }

  test("mid-transition frame for a visual check", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_A);
    await panel.waitForTimeout(600);
    await openTab(handle.app, FILE_URL_B);
    await panel.waitForTimeout(70);
    await panel.screenshot({
      path: "/tmp/motion-mid.png",
      clip: { x: 0, y: 0, width: 700, height: 40 },
    });
    await panel.waitForTimeout(500);
    await panel.screenshot({
      path: "/tmp/motion-end.png",
      clip: { x: 0, y: 0, width: 700, height: 40 },
    });
    await closeApp(handle);
  });
});
