import { expect, test } from "@playwright/test";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

/**
 * A collapsed group renders only its chip — no [data-tab-id] children. The group
 * drag used to read its member ids from those children, got none, and the
 * group's tabs fell out of the dropped order: wherever it was dropped, the
 * group landed at the end of the strip.
 */

const URLS = [
  "https://www.figma.com/design/AAA111aaa/alpha",
  "https://www.figma.com/design/BBB222bbb/beta",
  "https://www.figma.com/design/CCC333ccc/gamma",
];

async function findPanelPage(app: AppHandle["app"]) {
  for (let i = 0; i < 50; i++) {
    for (const page of app.windows()) {
      const has = await page.evaluate(() => !!document.querySelector("#panel")).catch(() => false);
      if (has) return page;
    }
    await app.windows()[0]?.waitForTimeout(100);
  }
  throw new Error("panel page (#panel) not found");
}

type Panel = Awaited<ReturnType<typeof findPanelPage>>;

/** Strip units left to right: a tab id, or `group:<label>` for a group chip. */
async function stripUnits(panel: Panel): Promise<string[]> {
  return panel.evaluate(() => {
    const list = document.querySelector(
      "#panel [data-group-id], #panel [data-tab-id]",
    )?.parentElement;
    if (!list) return [];
    return [...list.children].flatMap((el) => {
      const h = el as HTMLElement;
      if (h.dataset.groupId) return [`group:${h.getAttribute("aria-label")}`];
      if (h.dataset.tabId) return [h.dataset.tabId];
      return [];
    });
  });
}

test("a collapsed group stays where it is dropped", async () => {
  const handle = await launchApp({
    settings: { app: { frameStyle: "gnome", frameStyleAuto: false } },
  });
  const panel = await findPanelPage(handle.app);

  for (const url of URLS) {
    await handle.app.evaluate(({ app: electronApp }, tabUrl) => {
      electronApp.emit("openUrlInNewTab", tabUrl);
    }, url);
  }
  await expect.poll(async () => (await stripUnits(panel)).length).toBe(3);
  const [a, b, c] = await stripUnits(panel);

  // Group the middle tab, then collapse it with its chip: [A] [G] [C].
  await panel.evaluate(
    (tabId) =>
      window.figmaApi.send("createTabGroupWithTab", { tabId, label: "G", color: "#4285f4" }),
    Number(b),
  );
  await expect.poll(() => stripUnits(panel)).toEqual([a, "group:G", c]);
  await panel.locator(".tab-group-header").click();
  await expect(panel.locator("[data-group-id] [data-tab-id]")).toHaveCount(0);

  // Drag the chip to the front of the strip.
  const chip = await panel.locator(".tab-group-header").boundingBox();
  const first = await panel.locator(`[data-tab-id="${a}"]`).boundingBox();
  if (!chip || !first) throw new Error("strip not laid out");
  const y = chip.y + chip.height / 2;
  const startX = chip.x + chip.width / 2;
  const endX = first.x + 4;

  await panel.mouse.move(startX, y);
  await panel.mouse.down();
  await panel.mouse.move(startX - 8, y);
  for (let i = 1; i <= 6; i++) {
    await panel.mouse.move(startX + ((endX - startX) * i) / 6, y);
    await panel.waitForTimeout(40);
  }
  await panel.mouse.up();

  await expect.poll(() => stripUnits(panel)).toEqual(["group:G", a, c]);

  await closeApp(handle);
});
