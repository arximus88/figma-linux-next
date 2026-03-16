import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

test.describe("App launch", () => {
  test("launches and shows the panel window", async () => {
    const handle = await launchApp();
    const { panel } = handle;

    // Panel window is visible
    expect(await panel.title()).toBeTruthy();

    // The app emitted no unhandled crashes
    const windows = handle.app.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);

    await closeApp(handle);
  });

  test("panel page loads without JS errors", async () => {
    const handle = await launchApp();
    const { panel } = handle;

    const errors: string[] = [];
    panel.on("pageerror", (err) => errors.push(err.message));

    await panel.waitForTimeout(1000);

    // No unhandled JS errors on load
    expect(errors).toHaveLength(0);

    await closeApp(handle);
  });
});
