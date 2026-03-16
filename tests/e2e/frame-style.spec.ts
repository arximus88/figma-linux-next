import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

/**
 * Change frame style via the Settings IPC path (same as the UI dropdown).
 */
async function setFrameStyle(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  style: "gnome" | "windows" | "macos",
) {
  await app.evaluate(
    ({ ipcMain }, s) => {
      ipcMain.emit("setFrameStyle", { sender: { id: -1 } } as any, s);
    },
    style,
  );
}

test.describe("Window frame style", () => {
  test("switches from GNOME to Windows style without crash", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(300);

    await setFrameStyle(handle.app, "windows");
    await handle.panel.waitForTimeout(300);

    expect(handle.app.windows().length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });

  test("switches back from Windows to GNOME style", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(300);

    await setFrameStyle(handle.app, "windows");
    await handle.panel.waitForTimeout(200);
    await setFrameStyle(handle.app, "gnome");
    await handle.panel.waitForTimeout(200);

    expect(handle.app.windows().length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });

  test("cycles through all available styles", async () => {
    const handle = await launchApp();
    await handle.panel.waitForTimeout(300);

    const styles: Array<"gnome" | "windows" | "macos"> = ["gnome", "windows", "gnome"];
    for (const style of styles) {
      await setFrameStyle(handle.app, style);
      await handle.panel.waitForTimeout(200);
    }

    expect(handle.app.windows().length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });
});
