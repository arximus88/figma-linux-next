import { expect, type Page, test } from "@playwright/test";
import { SECTIONS, SETTINGS } from "../../src/renderer/Settings/schema";
import { findPanelPage, openSettings, openTab, shownView, stripTabs } from "./helpers/app";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

const A = "https://www.figma.com/design/AAA111aaa/alpha";
const B = "https://www.figma.com/design/BBB222bbb/beta";

async function openSection(page: Page, title: string) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

/** Launch with file tabs open, the last one in front; returns their ids in strip order. */
async function launchWithFiles(...urls: string[]) {
  const handle = await launchApp();
  const panel = await findPanelPage(handle.app);
  for (const url of urls) await openTab(handle.app, url);
  await expect.poll(async () => (await stripTabs(panel)).length).toBe(urls.length);
  const ids = (await stripTabs(panel)).map((t) => t.id);
  return { handle, panel, ids };
}

const settingsTab = (panel: Page) => panel.getByRole("tab", { name: "Settings" });

/** A value from main's settings store (the invoke reaches main, not a renderer copy). */
async function saved(handle: AppHandle, read: (s: any) => unknown) {
  const panel = await findPanelPage(handle.app);
  return read(await panel.evaluate(() => window.figmaApi.invoke("getSettings")));
}

test.describe("Settings tab", () => {
  test("switching away keeps it in the strip; × returns to the file", async () => {
    const { handle, panel, ids } = await launchWithFiles(A);
    await openSettings(handle);

    await expect(settingsTab(panel)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => shownView(handle.app)).toContain("settings.html");

    // Click the file: it takes the screen, Settings stays in the strip.
    await panel.locator(`[data-tab-id="${ids[0]}"] [data-drag-handle]`).click();
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    await expect(settingsTab(panel)).toHaveAttribute("aria-selected", "false");

    // Click Settings: the same page comes back, still one tab.
    await settingsTab(panel).click();
    await expect.poll(() => shownView(handle.app)).toContain("settings.html");
    await expect(settingsTab(panel)).toHaveCount(1);

    await panel.getByRole("button", { name: "Close Settings" }).click();
    await expect(settingsTab(panel)).toHaveCount(0);
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");
    expect((await stripTabs(panel)).find((t) => t.active)?.id).toBe(ids[0]);

    await closeApp(handle);
  });

  test("Ctrl+W on Settings closes Settings, not the file under it", async () => {
    const { handle, panel, ids } = await launchWithFiles(A);
    await openSettings(handle);

    await handle.app.evaluate(({ app }) => {
      app.emit("closeCurrentTab"); // the Close Tab menu item / Ctrl+W
    });

    await expect(settingsTab(panel)).toHaveCount(0);
    expect((await stripTabs(panel)).map((t) => t.id)).toEqual(ids);
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");

    await closeApp(handle);
  });

  test("a file opened while Settings is in front comes to the front", async () => {
    const { handle, panel } = await launchWithFiles(A);
    await openSettings(handle);

    await openTab(handle.app, B);

    await expect.poll(() => shownView(handle.app)).toContain("BBB222bbb");
    await expect(settingsTab(panel)).toHaveAttribute("aria-selected", "false");
    // Ctrl+W now belongs to the file.
    await handle.app.evaluate(({ app }) => {
      app.emit("closeCurrentTab");
    });
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(1);
    await expect(settingsTab(panel)).toHaveCount(1);

    await closeApp(handle);
  });

  test("closing another tab while Settings is in front leaves Settings in front", async () => {
    const { handle, panel, ids } = await launchWithFiles(A, B);
    await openSettings(handle);

    // B was in front before Settings — the tab Settings covers.
    await panel
      .locator(`[data-tab-id="${ids[1]}"]`)
      .getByRole("button", { name: /^Close/ })
      .click();

    await expect.poll(async () => (await stripTabs(panel)).map((t) => t.id)).toEqual([ids[0]]);
    await expect.poll(() => shownView(handle.app)).toContain("settings.html");
    await expect(settingsTab(panel)).toHaveAttribute("aria-selected", "true");

    // Closing Settings now must land on a live file, not the closed one.
    await panel.getByRole("button", { name: "Close Settings" }).click();
    await expect.poll(() => shownView(handle.app)).toContain("AAA111aaa");

    await closeApp(handle);
  });

  test("follows the window size", async () => {
    const handle = await launchApp();
    await openSettings(handle);

    // Main's side of it: the page's own innerWidth lags behind under xvfb.
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

test.describe("Settings saving", () => {
  test("a change applies right away, without closing Settings", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);

    await openSection(page, "Tabs & windows");
    await page.getByRole("switch", { name: "Tab previews on hover" }).click();

    await expect.poll(() => saved(handle, (s) => s.app.tabHoverPreviews)).toBe(false);

    await closeApp(handle);
  });

  test("an edit made right before closing the window survives the restart", async () => {
    const first = await launchApp();
    const panel = await findPanelPage(first.app);
    const page = await openSettings(first);
    await openSection(page, "Tabs & windows");

    // Inside the autosave debounce: nothing is written yet when the window goes.
    await page.getByRole("switch", { name: "Tab previews on hover" }).click();
    const exited = first.app.waitForEvent("close");
    await panel.getByRole("button", { name: "Close window" }).click();
    await exited;

    const second = await launchApp({ userDataDir: first.userDataDir });
    expect(await saved(second, (s) => s.app.tabHoverPreviews)).toBe(false);

    await closeApp(second);
  });

  test("a switch flipped and flipped back before the save ends up unchanged", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);
    await openSection(page, "Tabs & windows");
    const toggle = page.getByRole("switch", { name: "Tab previews on hover" });

    // Both clicks land inside one autosave delay.
    await toggle.click();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.waitForTimeout(800); // past the delay: a stale save would have landed

    expect(await saved(handle, (s) => s.app.tabHoverPreviews)).toBe(true);

    await closeApp(handle);
  });

  test("a restart-only setting asks for a restart until it is flipped back", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);
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

  test("an edit does not roll back state main changed after Settings loaded", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);

    // Settings holds its snapshot. Main now learns of a signed-in user…
    await handle.app.evaluate(({ ipcMain }) => {
      ipcMain.emit("setUser", { sender: { id: -1 } }, "e2e-user");
    });
    // …then the user edits a setting, which is written back.
    await openSection(page, "Tabs & windows");
    await page.getByRole("switch", { name: "Tab previews on hover" }).click();
    await expect.poll(() => saved(handle, (s) => s.app.tabHoverPreviews)).toBe(false);

    expect(await saved(handle, (s) => s.userId)).toBe("e2e-user");

    await closeApp(handle);
  });
});

test.describe("Settings page", () => {
  test("text uses the native system sans (not the serif fallback)", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);

    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.toLowerCase()).toContain("system-ui");
    expect(fontFamily.toLowerCase()).not.toContain("times");

    await closeApp(handle);
  });

  test("every switch is named after its setting", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);

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

    await closeApp(handle);
  });

  test("every setting in the schema is on screen in its section", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);

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
    const page = await openSettings(handle);

    await page.keyboard.press("Control+K");
    await page.keyboard.type("debugging");
    await page.getByRole("button", { name: /Debugging port/ }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Integrations");
    await expect(page.locator("#setting-cdp-port")).toBeInViewport();

    await closeApp(handle);
  });
});
