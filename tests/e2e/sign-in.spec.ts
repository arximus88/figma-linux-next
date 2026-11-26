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

/** Pages sitting on figma.com/login. */
function loginPageIds(handle: AppHandle): Promise<number[]> {
  return handle.app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => new URL(wc.getURL() || "about:blank").pathname === "/login")
      .map((wc) => wc.id),
  );
}

/**
 * The home tab's page. Read before any file tab exists: once they are on
 * /login too, "the page on /login" no longer names one page.
 */
async function homePageId(handle: AppHandle): Promise<number> {
  await expectShown(handle, "figma.com/login");
  const ids = await loginPageIds(handle);
  if (ids.length !== 1) throw new Error(`expected only the home tab on /login, got ${ids.length}`);
  return ids[0];
}

/** What Figma's page sends from the home tab once the browser sign-in is redeemed. */
async function signIn(handle: AppHandle, homeId: number) {
  await handle.setSignedOut(false);
  await handle.app.evaluate(({ ipcMain, webContents }, id) => {
    const home = webContents.fromId(id);
    if (!home) throw new Error(`home page ${id} is gone`);
    ipcMain.emit("finishAppAuth", { sender: home }, { redirectURL: "/files/recents" });
  }, homeId);
}

test("signing in keeps open file tabs in the strip and loads them under the session", async () => {
  const handle = await launchApp({ signedOut: true });
  try {
    const homeId = await homePageId(handle);
    await openTab(handle.app, urls[0]);
    await openTab(handle.app, urls[1]);
    const panel = await findPanelPage(handle.app);
    await expect.poll(async () => (await stripTabs(panel)).length).toBe(2);
    const before = (await stripTabs(panel)).map((t) => t.id);
    // Signed out, a file tab ends on the login page like everything else.
    // Wait for both to get there: "no tab on a file" also holds before they
    // have loaded anything, and a signed-out load still in flight when the
    // session starts would race the reload this test is about.
    await expect.poll(async () => (await loginPageIds(handle)).length).toBe(3);
    expect(await liveFileUrls(handle)).toEqual([]);

    await signIn(handle, homeId);
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
    const homeId = await homePageId(handle);
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

    await signIn(handle, homeId);
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
