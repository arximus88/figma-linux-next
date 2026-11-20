import { expect, type Page, test } from "@playwright/test";
import { expectShown, findPanelPage, openTab, shownView, stripTabs } from "./helpers/app";
import { type AppHandle, closeApp, launchApp } from "./helpers/launch";

// Start signed out (figma.com sends every page to /login), then sign in the
// way Figma's page reports it: finishAppAuth from the home tab, after which
// the server accepts the session. No Figma account involved — the stub in
// helpers/launch.ts plays the server.

const keys = ["AAA111aaa", "BBB222bbb", "CCC333ccc"];
const urls = keys.map((key) => `https://www.figma.com/design/${key}/sign-in-test`);

/** URLs of the live file tabs' pages (a discarded tab has none). */
function liveFileUrls(handle: AppHandle): Promise<string[]> {
  return handle.app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .map((wc) => wc.getURL())
      .filter((url) => url.includes("/design/")),
  );
}

/** Ids of strip tabs drawn as not loaded. */
function discardedIds(panel: Page): Promise<number[]> {
  return panel.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#panel [data-tab-id]")]
      .filter((el) => el.querySelector(".tab-discarded"))
      .map((el) => Number(el.dataset.tabId)),
  );
}

/** What Figma's page sends from the home tab once the browser sign-in is redeemed. */
async function signIn(handle: AppHandle) {
  await handle.setSignedOut(false);
  await handle.app.evaluate(({ ipcMain, webContents }) => {
    const home = webContents
      .getAllWebContents()
      .find((wc) => new URL(wc.getURL() || "about:blank").pathname === "/login");
    if (!home) throw new Error("no page on /login");
    ipcMain.emit("finishAppAuth", { sender: home }, { redirectURL: "/files/recents" });
  });
}

test("signing in keeps open file tabs in the strip and loads them under the session", async () => {
  const handle = await launchApp({ signedOut: true });
  try {
    await expectShown(handle, "figma.com/login");
    await openTab(handle.app, urls[0]);
    await openTab(handle.app, urls[1]);
    const panel = await findPanelPage(handle.app);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(2);
    const before = (await stripTabs(panel)).map((t) => t.id);
    // Signed out, a file tab ends on the login page like everything else.
    await expect.poll(() => liveFileUrls(handle)).toEqual([]);

    await signIn(handle);
    await expectShown(handle, "figma.com/files/recents");

    // The panel used to be reloaded here and came back with an empty strip.
    const after = await findPanelPage(handle.app);
    await after.waitForTimeout(500);
    expect((await stripTabs(after)).map((t) => t.id)).toEqual(before);

    // The tab loads its file again, now that there is a session.
    await after.locator(`[data-tab-id="${before[1]}"] [data-drag-handle]`).click();
    await expectShown(handle, "/design/BBB222bbb");
  } finally {
    await closeApp(handle);
  }
});

test("a signed-out start keeps saved tabs unloaded until sign-in, then loads them", async () => {
  const handle = await launchApp({
    signedOut: true,
    settings: {
      app: {
        saveLastOpenedTabs: true,
        lazyRestoreTabs: false,
        windowsState: {
          1: {
            x: 0,
            y: 0,
            width: 1000,
            height: 700,
            isMaximized: false,
            userId: "",
            hasOpenedCommunityTab: false,
            lastActiveTabPath: "/design/BBB222bbb/sign-in-test",
            lastActiveTabIndex: 1,
            tabs: urls.map((url, i) => ({ url, title: `File ${i + 1}` })),
            tabGroups: [],
          },
        },
      },
    },
  });
  try {
    const panel = await findPanelPage(handle.app);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(3);
    const ids = (await stripTabs(panel)).map((t) => t.id);
    await expectShown(handle, "figma.com/login");
    // Give a non-lazy restore (300 ms apart) time to have created views.
    await panel.waitForTimeout(1500);
    expect(await discardedIds(panel)).toEqual(ids);
    // A file tab loaded signed out ends on /login too; only Home may be there.
    expect(
      await handle.app.evaluate(
        ({ webContents }) =>
          webContents.getAllWebContents().filter((wc) => wc.getURL().includes("/login")).length,
      ),
    ).toBe(1);
    expect(await liveFileUrls(handle)).toEqual([]);
    expect(await shownView(handle.app)).toContain("figma.com/login");

    await signIn(handle);
    await expect.poll(() => liveFileUrls(handle), { timeout: 5000 }).toHaveLength(3);
    await expect.poll(() => discardedIds(panel)).toEqual([]);
    expect((await stripTabs(panel)).map((t) => t.id)).toEqual(ids);
    // Home stays in front: that is where the user just signed in.
    await expectShown(handle, "figma.com/files/recents");

    await panel.locator(`[data-tab-id="${ids[2]}"] [data-drag-handle]`).click();
    await expectShown(handle, "/design/CCC333ccc");
  } finally {
    await closeApp(handle);
  }
});
