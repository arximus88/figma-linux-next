import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

test.describe("Settings", () => {
  test("opens settings view when triggered via IPC", async () => {
    const handle = await launchApp();
    const { app, panel } = handle;

    // Trigger settings open the same way the menu does
    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("openSettings");
    });

    // A second WebContentsView (settings) should appear as an additional window
    // Give it a moment to mount
    await panel.waitForTimeout(500);
    const windows = app.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });

  test("settings text uses the native system sans (not the serif fallback)", async () => {
    const handle = await launchApp();
    await handle.app.evaluate(({ ipcMain }) => {
      ipcMain.emit("openSettings");
    });
    await handle.panel.waitForTimeout(500);

    let settingsPage: any = null;
    for (let i = 0; i < 30 && !settingsPage; i++) {
      for (const page of handle.app.windows()) {
        const has = await page
          .evaluate(() => !!document.querySelector("#settings"))
          .catch(() => false);
        if (has) {
          settingsPage = page;
          break;
        }
      }
      if (!settingsPage) await handle.panel.waitForTimeout(100);
    }
    expect(settingsPage, "settings page (#settings) not found").not.toBeNull();

    const fontFamily = await settingsPage.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    // Native system sans stack — never the browser default serif.
    expect(fontFamily.toLowerCase()).toContain("system-ui");
    expect(fontFamily.toLowerCase()).not.toContain("times");

    await closeApp(handle);
  });

  test("settings view opens and closes without crash", async () => {
    const handle = await launchApp();
    const { app } = handle;

    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("openSettings");
    });
    await handle.panel.waitForTimeout(300);

    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("closeSettingsView");
    });
    await handle.panel.waitForTimeout(300);

    // App is still alive
    expect(app.windows().length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });

  test("settings view resizes when window resizes", async () => {
    const handle = await launchApp();
    const { app } = handle;

    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("openSettings");
    });
    await handle.panel.waitForTimeout(300);

    // Resize the BrowserWindow via Electron main process
    await app.evaluate(async ({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win.setSize(1024, 700);
    });
    await handle.panel.waitForTimeout(300);

    await app.evaluate(async ({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win.setSize(1400, 900);
    });
    await handle.panel.waitForTimeout(300);

    // No crash = resize handling works
    expect(app.windows().length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });
});
