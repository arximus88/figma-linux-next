import { expect, test } from "@playwright/test";
import { findPanelPage, openSettings, openTab } from "./helpers/app";
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

  // Breeze's active tab merges into the view below it — in Dolphin. Here the
  // view below is Figma or Settings, a different colour, so a tab painting the
  // panel's bottom row stuck 1px out of the title bar.
  test("KDE: the panel's bottom edge runs under the active tab", async () => {
    const handle = await launchApp({
      settings: { app: { frameStyle: "kde", frameStyleAuto: false } },
    });
    const panel = await findPanelPage(handle.app);
    await openTab(handle.app, "https://www.figma.com/design/AAA111aaa/alpha");
    const active = panel.locator('[class*="k-tab--active"]');
    await expect(active).toHaveCount(1);
    const box = (await active.boundingBox())!;
    const bottom = Math.round(box.y + box.height) - 1;
    const x = Math.round(box.x + box.width / 2);

    // Read two pixels of one screenshot: the tab's body and the panel's last row.
    const png = (
      await panel.screenshot({ clip: { x, y: bottom - 1, width: 1, height: 2 } })
    ).toString("base64");
    const [body, edge] = await panel.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const ctx = new OffscreenCanvas(1, 2).getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, 1, 2).data;
      return [
        [d[0], d[1], d[2]],
        [d[4], d[5], d[6]],
      ];
    }, png);

    // Not an exact match: rendering is off by a unit here and there. The edge
    // line darkens the row by ~40 (sum of channels); the bug left it within ~3.
    const diff = body.reduce((sum, c, i) => sum + Math.abs(c - edge[i]), 0);
    expect(diff, `tab body ${body} vs bottom row ${edge}`).toBeGreaterThan(20);

    await closeApp(handle);
  });
});
