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
  const app = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      NODE_ENV: "test",
      // Point to a writable temp config dir so tests don't touch the real one
      HOME: process.env.HOME,
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
