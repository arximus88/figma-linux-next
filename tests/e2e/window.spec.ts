import { expect, test } from "@playwright/test";
import { findPanelPage, openTab, stripTabs } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

const MENU_WIDTH = 330; // Const MENU_WIDTH

/**
 * Replace a BrowserWindow method with a call counter. Minimize and maximize
 * are the window manager's job, and the suite runs on a bare xvfb with none —
 * the X server ignores both. What the app owns is the wiring from the panel
 * button to the BrowserWindow call, so that is what gets recorded.
 */
async function countCalls(handle: Awaited<ReturnType<typeof launchApp>>, method: string) {
  await handle.app.evaluate(({ BrowserWindow }, name) => {
    const win = BrowserWindow.getAllWindows()[0] as any;
    (globalThis as any).__calls = 0;
    win[name] = () => {
      (globalThis as any).__calls++;
    };
  }, method);
  return () => handle.app.evaluate(() => (globalThis as any).__calls as number);
}

test.describe("Window controls", () => {
  for (const [button, method] of [
    ["Minimize", "minimize"],
    ["Maximize", "maximize"],
  ] as const) {
    test(`the ${button} button calls BrowserWindow.${method}`, async () => {
      const handle = await launchApp();
      const panel = await findPanelPage(handle.app);
      const calls = await countCalls(handle, method);

      await panel.getByRole("button", { name: button, exact: true }).click();

      await expect.poll(calls).toBe(1);
      await closeApp(handle);
    });
  }

  test("closing the window quits and the next start restores its tabs", async () => {
    const first = await launchApp();
    const panel = await findPanelPage(first.app);
    await openTab(first.app, "https://www.figma.com/design/AAA111aaa/alpha");
    await openTab(first.app, "https://www.figma.com/design/BBB222bbb/beta");
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(2);

    const exited = first.app.waitForEvent("close");
    await panel.getByRole("button", { name: "Close window" }).click();
    await exited; // the last window closing ends the app (tray is off by default)

    const second = await launchApp({ userDataDir: first.userDataDir });
    const panel2 = await findPanelPage(second.app);
    await expect.poll(async () => (await stripTabs(panel2)).length).toBe(2);
    // Restored as the same files, not as two blank tabs.
    await expect
      .poll(() =>
        second.app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .map((wc) => wc.getURL().match(/design\/(\w+)/)?.[1])
            .filter(Boolean)
            .sort(),
        ),
      )
      .toEqual(["AAA111aaa", "BBB222bbb"]);

    await closeApp(second);
  });
});

test.describe("Main menu", () => {
  test("drops from the … button, right-aligned under it", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);

    // A native menu can't be inspected under xvfb; record where it was asked to pop.
    await handle.app.evaluate(({ Menu }) => {
      (globalThis as any).__popups = [];
      Menu.prototype.popup = (opts: any) => {
        (globalThis as any).__popups.push({ x: opts?.x, y: opts?.y });
      };
    });

    const button = panel.getByRole("button", { name: "Main menu" });
    await button.click();
    const box = (await button.boundingBox())!;

    await expect
      .poll(() => handle.app.evaluate(() => (globalThis as any).__popups))
      .toEqual([
        {
          x: Math.round(box.x + box.width) - MENU_WIDTH,
          y: Math.round(box.y + box.height),
        },
      ]);

    await closeApp(handle);
  });
});
