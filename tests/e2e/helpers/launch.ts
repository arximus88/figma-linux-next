import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

const MAIN_JS = path.resolve(__dirname, "../../../dist/main/main.js");

export interface AppHandle {
  app: ElectronApplication;
  panel: Page;
  /** The profile this instance runs on; pass it back to launchApp to "restart". */
  userDataDir: string;
}

export interface LaunchOptions {
  /** Partial settings.json to pre-seed (deep-merged with defaults on load). */
  settings?: Record<string, unknown>;
  /** Reuse a profile from an earlier launch instead of a fresh one. */
  userDataDir?: string;
}

/**
 * Launch the Electron app and wait for the panel window to be ready.
 * Intercepts all figma.com requests and serves a lightweight stub page
 * so tests run without network access or a real Figma account.
 */
export async function launchApp(opts?: LaunchOptions): Promise<AppHandle> {
  // Each test run gets its own user-data-dir so requestSingleInstanceLock()
  // doesn't collide with a running production instance or another test worker.
  const userDataDir = opts?.userDataDir ?? mkdtempSync(path.join(tmpdir(), "figma-e2e-"));

  // Pre-seed settings.json (read from userData/settings.json at startup) so the
  // app boots directly in the desired state — avoids flaky runtime IPC toggles.
  if (opts?.settings) {
    writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(opts.settings, null, 2));
  }

  // ELECTRON_RUN_AS_NODE makes the electron binary behave as plain Node.js — it
  // then rejects Chromium flags (--no-sandbox, --remote-debugging-port) and
  // require("electron") yields a path string instead of the API, so the app
  // never launches. Some sandboxed/CI shells export it; strip it for the child.
  //
  // WAYLAND_DISPLAY goes too: xvfb-run only swaps DISPLAY, and with the session's
  // Wayland socket still visible Electron picks ozone=wayland and opens every test
  // window on the developer's real desktop instead of the virtual X server.
  const {
    ELECTRON_RUN_AS_NODE: _runAsNode,
    WAYLAND_DISPLAY: _waylandDisplay,
    ...parentEnv
  } = process.env;

  const app = await electron.launch({
    args: [MAIN_JS, `--user-data-dir=${userDataDir}`],
    env: {
      ...parentEnv,
      XDG_SESSION_TYPE: "x11",
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

  return { app, panel, userDataDir };
}

export async function closeApp(handle: AppHandle) {
  await handle.app.close();
}
