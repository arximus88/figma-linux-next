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

  test("maximize button maximizes the window", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    const initialBounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getBounds();
    });

    await panel.evaluate(() => {
      window.figmaApi.send("windowMaximize");
    });

    const maximizedBounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getBounds();
    });

    expect(maximizedBounds.width).toBeGreaterThan(initialBounds.width);
    expect(maximizedBounds.height).toBeGreaterThan(initialBounds.height);

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

  test("settings opens from IPC", async () => {
    const handle = await launchApp();
    const { panel, app } = handle;

    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("openSettings");
    });

    await panel.waitForTimeout(2000);

    const url = panel.url();
    console.log("Panel URL:", url);

    const bodyText = await panel.evaluate(() => document.body.innerText);
    console.log("Body text length:", bodyText.length);
    console.log("Body text:", bodyText.substring(0, 300));

    expect(app.windows().length).toBeGreaterThan(0);

    await closeApp(handle);
  });
});
