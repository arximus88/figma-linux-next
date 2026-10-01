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
  test("Settings opens as a tab and closing it returns to the previous tab", async () => {
    const handle = await launchApp();
    const { panel } = handle;
    await settingsPageOf(handle);
    const stripTab = panel.getByRole("tab", { name: "Settings" });
    // The view's own flag: under xvfb (X11) a hidden view's document keeps
    // reporting visibilityState "visible".
    const visibility = () =>
      handle.app.evaluate(({ BrowserWindow }) => {
        const kids = BrowserWindow.getAllWindows()[0].contentView
          .children as Electron.WebContentsView[];
        const view = kids.find((v) => v.webContents?.getURL().includes("settings.html"));
        return view?.getVisible() ? "visible" : "hidden";
      });

    await expect(stripTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(visibility).toBe("visible");

    // Another tab takes the screen; Settings stays in the strip.
    await panel.evaluate(() => window.figmaApi.send("setFocusToMainTab"));
    await expect.poll(visibility).toBe("hidden");
    await expect(stripTab).toHaveAttribute("aria-selected", "false");

    // Opening it again shows the same page, not a second tab.
    await handle.app.evaluate(({ app }) => {
      app.emit("openSettingsView");
    });
    await expect.poll(visibility).toBe("visible");
    await expect(stripTab).toHaveCount(1);

    await panel.getByRole("button", { name: "Close Settings" }).click();
    await expect(stripTab).toHaveCount(0);
    await expect.poll(visibility).toBe("hidden");

    await closeApp(handle);
  });

  test("settings text uses the native system sans (not the serif fallback)", async () => {
    const handle = await launchApp();
    const settingsPage = await settingsPageOf(handle);

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

  test("the Settings tab follows the window size", async () => {
    const handle = await launchApp();
    await settingsPageOf(handle);

    // Window width vs. the Settings view's bounds — main's side of it. The
    // page's own innerWidth lags behind under xvfb.
    const widths = () =>
      handle.app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const kids = win.contentView.children as Electron.WebContentsView[];
        const view = kids.find((v) => v.webContents?.getURL().includes("settings.html"));
        return [win.getContentSize()[0], view?.getBounds().width];
      });

    for (const size of [
      [1024, 700],
      [1400, 900],
    ]) {
      await handle.app.evaluate(({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()[0].setSize(w, h);
      }, size);
      await expect.poll(widths).toEqual([size[0], size[0]]);
    }

    await closeApp(handle);
  });
});
