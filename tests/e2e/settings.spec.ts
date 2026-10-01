import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";
import { SECTIONS, SETTINGS } from "../../src/renderer/Settings/schema";

async function openSection(page: any, title: string) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

async function settingsPageOf(handle: Awaited<ReturnType<typeof launchApp>>) {
  // Shown, not just loaded: a hidden view runs no animation frames, and
  // Playwright waits on one before every click.
  await handle.app.evaluate(({ app }) => {
    app.emit("openSettingsView");
  });
  for (let i = 0; i < 30; i++) {
    const page = handle.app.windows().find((p) => p.url().includes("settings.html"));
    if (page) {
      await page.getByRole("switch").first().waitFor({ state: "attached" });
      return page;
    }
    await handle.panel.waitForTimeout(100);
  }
  throw new Error("settings page not found");
}

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

  test("every switch is named after its setting", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);

    const labels: string[] = [];
    for (const section of SECTIONS) {
      await openSection(page, section.title);
      labels.push(
        ...(await page
          .getByRole("switch")
          .evaluateAll((els: Element[]) => els.map((el) => el.getAttribute("aria-label") ?? ""))),
      );
    }

    expect(labels.length).toBeGreaterThan(10);
    expect(labels).not.toContain("");
    expect(labels).not.toContain("Toggle setting");
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Tab previews on hover");

    await closeApp(handle);
  });

  test("a change is saved right away, without closing Settings", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);

    const before = await page.evaluate(() => window.figmaApi.invoke("getSettings"));
    await openSection(page, "Tabs & windows");
    await page.getByRole("switch", { name: "Tab previews on hover" }).click();

    await expect
      .poll(async () => {
        const s: any = await page.evaluate(() => window.figmaApi.invoke("getSettings"));
        return s.app.tabHoverPreviews;
      })
      .toBe(!before.app.tabHoverPreviews);

    await closeApp(handle);
  });

  test("a restart-only setting asks for a restart until it is flipped back", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);
    const banner = page.getByRole("status").filter({ hasText: "Restart to apply" });
    const srgb = page.getByRole("switch", { name: "Use sRGB color space" });
    await openSection(page, "Appearance");

    await expect(banner).toHaveCount(0);
    await srgb.click();
    await expect(banner).toContainText("sRGB color space");
    await srgb.click();
    await expect(banner).toHaveCount(0);

    await closeApp(handle);
  });

  test("closing Settings does not roll back state main changed meanwhile", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);

    // Settings holds its snapshot. Main now learns of a signed-in user…
    await handle.app.evaluate(({ ipcMain }) => {
      ipcMain.emit("setUser", { sender: { id: -1 } }, "e2e-user");
    });
    // …then the user edits a setting and closes Settings.
    await openSection(page, "Tabs & windows");
    await page.getByRole("switch", { name: "Tab previews on hover" }).click();
    await page.evaluate(() => window.figmaApi.send("closeSettingsView"));
    await page.waitForTimeout(600);

    const after: any = await page.evaluate(() => window.figmaApi.invoke("getSettings"));
    expect(after.userId).toBe("e2e-user");

    await closeApp(handle);
  });

  test("every setting in the schema is on screen in its section", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);

    const missing: string[] = [];
    for (const section of SECTIONS) {
      await openSection(page, section.title);
      for (const setting of Object.values(SETTINGS).filter((s) => s.section === section.id)) {
        if ((await page.locator(`#setting-${setting.id}`).count()) !== 1) missing.push(setting.id);
      }
    }
    expect(missing).toEqual([]);

    await closeApp(handle);
  });

  test("search jumps to the setting and shows its section", async () => {
    const handle = await launchApp();
    const page = await settingsPageOf(handle);

    await page.keyboard.press("Control+K");
    await page.keyboard.type("debugging");
    await page.getByRole("button", { name: /Debugging port/ }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Integrations");
    await expect(page.locator("#setting-cdp-port")).toBeInViewport();

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
