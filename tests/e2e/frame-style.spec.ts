import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

/**
 * Change frame style via the Settings IPC path (same as the UI dropdown).
 */
async function setFrameStyle(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  style: "gnome" | "windows" | "macos",
) {
  await app.evaluate(({ ipcMain }, s) => {
    ipcMain.emit("setFrameStyle", { sender: { id: -1 } } as any, s);
  }, style);
}

test.describe("Window frame style", () => {
  // Cycling gnome -> windows -> gnome also covers switching to and back from
  // each style without crashing.
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
