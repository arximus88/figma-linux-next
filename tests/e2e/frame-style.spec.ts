import { expect, test } from "@playwright/test";
import { findPanelPage, openSettings } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

/**
 * Picking a frame in Settings restyles the panel at once — the live-save path
 * (updateSettings → planSettingsUpdate → frameStyleChanged), no restart.
 */
test.describe("Window frame style", () => {
  test("a frame picked in Settings applies live; automatic brings back the detected one", async () => {
    const handle = await launchApp();
    const panel = await findPanelPage(handle.app);
    const frame = () =>
      panel.evaluate(() => document.querySelector("#panel")?.getAttribute("data-frame"));

    const settings = await openSettings(handle);
    await settings.getByRole("button", { name: "Tabs & windows", exact: true }).click();

    const detected = (await settings.evaluate(() => window.figmaApi.invoke("getRuntimeInfo")))
      .detectedFrameStyle;
    const other = detected === "kde" ? "gnome" : "kde";
    const label = { gnome: "GNOME / Adwaita", kde: "KDE Plasma / Breeze" }[other];

    await settings.getByRole("radio", { name: new RegExp(label) }).click();
    await expect.poll(frame).toBe(other);
    // A manual pick turns automatic matching off.
    await expect(
      settings.getByRole("switch", { name: "Match the desktop environment" }),
    ).not.toBeChecked();

    await settings.getByRole("switch", { name: "Match the desktop environment" }).click();
    await expect.poll(frame).toBe(detected);

    await closeApp(handle);
  });
});
