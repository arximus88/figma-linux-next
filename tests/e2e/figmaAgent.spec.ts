import { expect, test } from "@playwright/test";
import { expectShown, findPanelPage, openSettings, stripTabs } from "./helpers/app";
import { closeApp, launchApp } from "./helpers/launch";

/**
 * The browser hand-off. figma.com in a browser does not use figma:// to reach
 * the desktop app: it probes the official app's local helper on 127.0.0.1:44950
 * and, when it answers, offers "Open in desktop app". These tests speak to the
 * app exactly as the page does (same path, same Origin, same query) and assert
 * what the user sees: the link in a tab in front, and the status chip in Settings.
 */

const AGENT = "http://127.0.0.1:44950/figma";
const FIGMA = "https://www.figma.com";
const FILE = `${FIGMA}/design/AAA111aaa/alpha?node-id=1-2`;

function agent(path: string, origin = FIGMA) {
  return fetch(`${AGENT}${path}`, { headers: { Origin: origin, "Content-Type": "text/plain" } });
}

const agentUp = () =>
  agent("/version").then(
    () => true,
    () => false,
  );

test.describe("Browser hand-off (FigmaAgent)", () => {
  // The port is fixed by figma.com's page, so a running production app that
  // already answers there would make every assertion below about the wrong process.
  test.beforeEach(async () => {
    test.skip(await agentUp(), "another figma-linux-next instance already listens on 44950");
  });

  test("answers figma.com's probe and opens the handed-over link in a tab", async () => {
    const handle = await launchApp({ settings: { userId: "42" } });
    const panel = await findPanelPage(handle.app);

    await expect.poll(agentUp).toBe(true);
    expect(await (await agent("/version")).json()).toEqual({ version: 24 });

    // "Can the app open files for the account signed in to this browser?"
    const canOpen = (userID: string) =>
      agent(`/desktop/can-open-url?userID=${userID}&url=${encodeURIComponent(FIGMA)}`).then((r) =>
        r.json(),
      );
    expect(await canOpen("42")).toEqual({ canOpen: true });
    expect(await canOpen("7")).toEqual({ canOpen: false });

    // The hand-off: the link opens here and takes the screen.
    expect((await stripTabs(panel)).length).toBe(0);
    const res = await agent(`/desktop/open-url?userID=42&url=${encodeURIComponent(FILE)}`);
    expect(await res.json()).toEqual({ opened: true });
    await expectShown(handle, "AAA111aaa");
    expect((await stripTabs(panel)).filter((t) => t.active).length).toBe(1);

    // Any other page gets nothing — a GET like this needs no preflight.
    const foreign = await agent(
      `/desktop/open-url?userID=42&url=${encodeURIComponent(FILE)}`,
      "https://evil.example",
    );
    expect(foreign.status).toBe(403);
    expect((await stripTabs(panel)).length).toBe(1);

    await closeApp(handle);
  });

  test("the Settings toggle stops and restarts the listener", async () => {
    const handle = await launchApp();
    const page = await openSettings(handle);
    await page.getByRole("button", { name: "Integrations", exact: true }).click();

    const chip = page.locator("#setting-browser-handoff [role=status]");
    const toggle = page.getByRole("switch", { name: "Open links from your browser" });
    await expect(chip).toHaveText("Listening on :44950");

    await toggle.click();
    await expect(chip).toHaveText("Off");
    await expect.poll(agentUp).toBe(false);

    await toggle.click();
    await expect(chip).toHaveText("Listening on :44950");
    await expect.poll(agentUp).toBe(true);

    await closeApp(handle);
  });

  test("stays off across a restart when turned off", async () => {
    const first = await launchApp({ settings: { app: { figmaAgentEnabled: false } } });
    await first.panel.waitForTimeout(500);
    expect(await agentUp()).toBe(false);
    await closeApp(first);
  });
});
