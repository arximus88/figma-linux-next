import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { _electron as electron, ElectronApplication, Page } from "@playwright/test";

const MAIN_JS = path.resolve(__dirname, "../../../dist/main/main.js");

export interface AppHandle {
  app: ElectronApplication;
  panel: Page;
}

/**
 * Launch the Electron app and wait for the panel window to be ready.
 * Intercepts all figma.com requests and serves a lightweight stub page
 * so tests run without network access or a real Figma account.
 */
export async function launchApp(): Promise<AppHandle> {
  // Each test run gets its own user-data-dir so requestSingleInstanceLock()
  // doesn't collide with a running production instance or another test worker.
  const userDataDir = mkdtempSync(path.join(tmpdir(), "figma-e2e-"));

  const app = await electron.launch({
    args: [MAIN_JS, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: "test",
      FIGMA_LOGLEVEL: "error",
    },
  });

  // The first window is the BrowserWindow which hosts the Panel renderer
  const panel = await app.firstWindow();

  // Intercept figma.com so tabs load instantly without network
  await panel.context().route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("figma.com")) {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!DOCTYPE html><html><head><title>Figma stub</title></head>
               <body><div id="stub">figma stub</div></body></html>`,
      });
    } else {
      route.continue();
    }
  });

  await panel.waitForLoadState("domcontentloaded");

  return { app, panel };
}

export async function closeApp(handle: AppHandle) {
  await handle.app.close();
}
