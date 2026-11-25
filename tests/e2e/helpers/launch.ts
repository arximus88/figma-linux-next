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
  /** Make the figma.com stub answer as a server with (false) or without (true) a session. */
  setSignedOut(signedOut: boolean): Promise<void>;
}

export interface LaunchOptions {
  /** Partial settings.json to pre-seed (deep-merged with defaults on load). */
  settings?: Record<string, unknown>;
  /** Reuse a profile from an earlier launch instead of a fresh one. */
  userDataDir?: string;
  /**
   * Main-process code run (via `-r`) before the app's own main.js — the only
   * way to act before the panel loads, for startup races.
   */
  mainHook?: string;
  /**
   * Start with figma.com answering as it does with no valid session: every
   * page but /login and /app_auth/ redirects to /login. Flip it with
   * AppHandle.setSignedOut.
   */
  signedOut?: boolean;
}

const FIGMA_URL = /^https?:\/\/([^/]+\.)?figma\.com\//;

/** Where the stub sends `url`: figma.com without a session redirects every page but these to /login. */
function loginRedirect(url: string, signedOut: boolean): string | undefined {
  const parsed = new URL(url);
  if (!signedOut || /^\/(login|app_auth)(\/|$)/.test(parsed.pathname)) return undefined;
  return `${parsed.origin}/login`;
}

const STUB_PAGE = `<!DOCTYPE html><html><head><title>Figma stub</title></head>
  <body><div id="stub">figma stub</div></body></html>`;

/**
 * Main-process hook serving the same stub from the very first request. The
 * Playwright route below is installed only once the first window exists, and
 * the home tab's first request used to slip past it to the real figma.com.
 */
function stubHook(signedOut: boolean): string {
  return `
    const { app, net, session } = require("electron");
    const FIGMA_URL = ${FIGMA_URL.toString()};
    const loginRedirect = ${loginRedirect.toString()};
    globalThis.__e2eSignedOut = ${signedOut};
    app.whenReady().then(() => {
      session.defaultSession.protocol.handle("https", (req) => {
        if (!FIGMA_URL.test(req.url)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
        const to = loginRedirect(req.url, globalThis.__e2eSignedOut);
        return to
          ? new Response(null, { status: 302, headers: { location: to } })
          : new Response(${JSON.stringify(STUB_PAGE)}, { headers: { "content-type": "text/html" } });
      });
    });
  `;
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

  let signedOut = opts?.signedOut ?? false;
  const stubFile = path.join(userDataDir, "e2e-figma-stub.js");
  writeFileSync(stubFile, stubHook(signedOut));
  const hook: string[] = ["-r", stubFile];
  if (opts?.mainHook) {
    const file = path.join(userDataDir, "e2e-main-hook.js");
    writeFileSync(file, opts.mainHook);
    hook.push("-r", file);
  }

  const app = await electron.launch({
    args: [...hook, MAIN_JS, `--user-data-dir=${userDataDir}`],
    env: {
      ...parentEnv,
      XDG_SESSION_TYPE: "x11",
      NODE_ENV: "test",
    },
  });

  // The first window is the BrowserWindow which hosts the Panel renderer
  const panel = await app.firstWindow();

  // Intercept figma.com so tabs load instantly without network. Only figma.com:
  // a catch-all route also catches the panel's own file:// resources while the
  // panel is still loading, and a request caught mid-load could hold its `load`
  // event for seconds.
  await panel.context().route(FIGMA_URL, (route) => {
    const to = loginRedirect(route.request().url(), signedOut);
    return to
      ? route.fulfill({ status: 302, headers: { location: to } })
      : route.fulfill({ status: 200, contentType: "text/html", body: STUB_PAGE });
  });

  // Fully loaded, not just DOMContentLoaded: the panel's load event is what
  // puts Home in front (Window.webContentDidFinishLoad). Tests start from there.
  await panel.waitForLoadState("load");

  const setSignedOut = async (next: boolean) => {
    signedOut = next;
    await app.evaluate((_, value) => {
      (globalThis as { __e2eSignedOut?: boolean }).__e2eSignedOut = value;
    }, next);
  };

  return { app, panel, userDataDir, setSignedOut };
}

export async function closeApp(handle: AppHandle) {
  await handle.app.close();
}
