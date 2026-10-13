import { expect, test } from "@playwright/test";
import { findPanelPage, openSettings } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

test.describe("App launch", () => {
  // The listener has to be attached before the page runs, and launchApp
  // returns after the panel has booted — so reload the pages under watch.
  // An error thrown during startup (a bad import, a store read before the
  // settings arrive) is exactly what this is for.
  test("the panel and Settings boot without uncaught errors", async () => {
    const handle = await launchApp();
    const pages = [await findPanelPage(handle.app), await openSettings(handle)];

    const errors: string[] = [];
    for (const page of pages) {
      page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));
      await page.reload();
      await page.waitForLoadState("load");
    }
    await pages[0].locator("#panel").waitFor();
    await pages[1].getByRole("switch").first().waitFor({ state: "attached" });

    expect(errors).toEqual([]);

    await closeApp(handle);
  });
});
