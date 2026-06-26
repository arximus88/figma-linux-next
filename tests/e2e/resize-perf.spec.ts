import { test, expect } from "@playwright/test";
import { launchApp, closeApp } from "./helpers/launch";

const GRID_HTML = `<!DOCTYPE html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: grid; grid-template-columns: repeat(20, 1fr); grid-template-rows: repeat(20, 1fr); width: 100vw; height: 100vh; }
  div { background: hsl(calc(var(--i) * 18), 60%, 60%); }
</style></head><body>
${Array.from({ length: 400 }, (_, i) => `<div style="--i:${i}"></div>`).join("")}
</body></html>`;

const FILE_URLS = [
  "https://www.figma.com/design/AAA111aaa/alpha",
  "https://www.figma.com/design/BBB222bbb/beta",
  "https://www.figma.com/design/CCC333ccc/gamma",
];

async function openTab(app: Awaited<ReturnType<typeof launchApp>>["app"], url: string) {
  await app.evaluate(({ app: ea }, u) => ea.emit("openUrlInNewTab", u), url);
}

async function getInnerWidth(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  wcId: number,
): Promise<number> {
  return app.evaluate(async ({ webContents }, id) => {
    const wc = webContents.fromId(id);
    if (!wc || wc.isDestroyed()) return -1;
    return wc.executeJavaScript("window.innerWidth");
  }, wcId);
}

async function getFileTabWcIds(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
): Promise<number[]> {
  return app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => wc.getURL().includes("figma.com/design"))
      .map((wc) => wc.id),
  );
}

/** Resize the BrowserWindow and emit resize event so updateTabsBounds fires. */
async function resizeTo(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  width: number,
  height = 800,
) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setBounds({ x: 100, y: 100, width: w, height: h });
      // emit resize manually so updateTabsBounds fires in the test environment
      win.emit("resize");
    },
    { w: width, h: height },
  );
}

function withGridRoute(handle: Awaited<ReturnType<typeof launchApp>>) {
  return handle.panel
    .context()
    .route("**/*", (route) =>
      route.request().url().includes("figma.com")
        ? route.fulfill({ status: 200, contentType: "text/html", body: GRID_HTML })
        : route.continue(),
    );
}

test.describe("Resize bounds correctness", () => {
  test("active file tab has correct innerWidth after resize", async () => {
    const handle = await launchApp();
    await withGridRoute(handle);
    await handle.panel.waitForTimeout(400);

    await openTab(handle.app, FILE_URLS[0]);
    await handle.panel.waitForTimeout(400);

    const [activeWcId] = await getFileTabWcIds(handle.app);
    expect(activeWcId).toBeDefined();

    await resizeTo(handle.app, 1111);
    await handle.panel.waitForTimeout(150);

    const innerWidth = await getInnerWidth(handle.app, activeWcId);
    expect(innerWidth).toBe(1111);

    await closeApp(handle);
  });

  test("app does not crash after 50 rapid resize cycles with 3 tabs open", async () => {
    const handle = await launchApp();
    await withGridRoute(handle);
    await handle.panel.waitForTimeout(400);

    for (const url of FILE_URLS) {
      await openTab(handle.app, url);
      await handle.panel.waitForTimeout(200);
    }

    const wcCountBefore = await handle.app.evaluate(
      ({ webContents }) => webContents.getAllWebContents().length,
    );

    // 50 rapid resizes alternating two sizes
    for (let i = 0; i < 50; i++) {
      await resizeTo(handle.app, i % 2 === 0 ? 1000 : 1400);
    }
    await handle.panel.waitForTimeout(200);

    // App alive, no leaked WebContentsViews
    expect(handle.app.windows().length).toBeGreaterThanOrEqual(1);
    const wcCountAfter = await handle.app.evaluate(
      ({ webContents }) => webContents.getAllWebContents().length,
    );
    expect(wcCountAfter).toBe(wcCountBefore);

    // Final size applied correctly on active tab
    const [activeWcId] = await getFileTabWcIds(handle.app);
    const finalWidth = await getInnerWidth(handle.app, activeWcId);
    expect(finalWidth).toBe(1400); // last resize was 1400 (i=49, odd)

    await closeApp(handle);
  });
});
