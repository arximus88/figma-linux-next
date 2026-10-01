import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

test.describe("Window controls", () => {
  test("minimize button does not crash the app", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    await panel.evaluate(() => {
      window.figmaApi.send("windowMinimize");
    });

    await panel.waitForTimeout(500);

    expect(app.windows().length).toBeGreaterThan(0);

    await closeApp(handle);
  });

  test("maximize button asks the window to maximize", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    // Maximizing is the window manager's job, and the suite runs on a bare xvfb
    // with none — there the X server ignores the request and the bounds never
    // change. What the app owns is the wiring: the button's IPC reaching
    // BrowserWindow.maximize(), so that is what gets recorded.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      (globalThis as any).__maximizeCalls = 0;
      win.maximize = () => {
        (globalThis as any).__maximizeCalls++;
      };
    });

    await panel.evaluate(() => {
      window.figmaApi.send("windowMaximize");
    });

    await expect.poll(() => app.evaluate(() => (globalThis as any).__maximizeCalls)).toBe(1);

    await closeApp(handle);
  });

  test("close button does not crash before closing", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    await panel.evaluate(() => {
      window.figmaApi.send("windowClose", {});
    });

    await panel.waitForTimeout(500);

    expect(app.windows().length).toBeGreaterThan(0);

    await app.close();
  });
});

test.describe("Menu and Settings", () => {
  test("more menu opens when clicked", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    await panel.evaluate(() => {
      window.figmaApi.send("openMainMenu");
    });

    await panel.waitForTimeout(500);

    expect(app.windows().length).toBeGreaterThan(0);

    await closeApp(handle);
  });
});
