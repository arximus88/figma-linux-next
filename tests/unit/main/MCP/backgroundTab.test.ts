/**
 * Tools in a tab that is not ready or not on screen (issue #90).
 *
 * A file opened in the background has no Plugin API until Figma's editor has
 * loaded, which starts once the first MCP call keeps the tab awake. Tools used
 * to answer "switch to the tab in the app and retry" — an instruction that
 * interrupts the user. They now wait for the editor and run again.
 */

import { describe, expect, test } from "bun:test";
import { pluginApiMissing, ToolHandlers, type ToolContext } from "Main/MCP/handlers/ToolHandlers";
import {
  EDITOR_STATE_SCRIPT,
  FRAMES_PROBE_SCRIPT,
  PLUGIN_API_UNAVAILABLE_PREFIX,
} from "Main/MCP/scripts/helpers";

const LOADING = `${PLUGIN_API_UNAVAILABLE_PREFIX}the tab is in the background and Figma has not finished loading its editor.`;

interface Page {
  /** Probe answers, one per poll; the last one repeats. */
  states: { ready: boolean; blocked: boolean }[];
  /** What a tool script returns while the editor is missing / once it is there. */
  missing: unknown;
  ready?: unknown;
  frames?: boolean;
  visible?: boolean;
  /** A tool script that never answers (a stalled export). */
  stall?: boolean;
}

function harness(page: Page, extra: Partial<ToolContext> = {}) {
  const calls = { probes: 0, scripts: 0, capturePage: 0 };
  let editorReady = false;
  const ctx: ToolContext = {
    viewProvider: {
      executeInBrowserView: async (script: string) => {
        if (script === EDITOR_STATE_SCRIPT) {
          const state = page.states[Math.min(calls.probes, page.states.length - 1)];
          calls.probes++;
          editorReady = state.ready;
          return state;
        }
        if (script === FRAMES_PROBE_SCRIPT) return page.frames ?? true;
        calls.scripts++;
        if (page.stall) return new Promise(() => {});
        return editorReady ? page.ready : page.missing;
      },
      getActiveTabView: () =>
        ({
          getVisible: () => page.visible ?? true,
          webContents: {
            capturePage: async () => {
              calls.capturePage++;
              return { toPNG: () => Buffer.from("png") };
            },
          },
        }) as any,
      getActiveTabUrl: (): null => null,
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    codeConnectMap: new Map(),
    assetStore: new Map(),
    getPort: () => 3845,
    getSaveBaseDir: () => "/tmp",
    editorWaitMs: 2_000,
    ...extra,
  };
  return { handlers: new ToolHandlers(ctx), calls };
}

const textOf = (response: any) => response.content.map((c: any) => c.text ?? "").join("\n");

describe("a tab whose editor is still loading", () => {
  test("the tool waits for the editor and then answers, instead of failing", async () => {
    const { handlers, calls } = harness({
      states: [
        { ready: false, blocked: false },
        { ready: false, blocked: false },
        { ready: true, blocked: false },
      ],
      missing: { error: LOADING },
      ready: { fileName: "Checkout", currentPage: { name: "Page 1" } },
    });

    const response: any = await handlers.toolGetFileInfo();

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toContain("Checkout");
    expect(calls.probes).toBe(3);
    // Once before the wait, once after: never while the editor was missing.
    expect(calls.scripts).toBe(2);
  });

  test("scripts that answer with a JSON string are recognised too", async () => {
    const { handlers } = harness({
      states: [{ ready: true, blocked: false }],
      missing: JSON.stringify({ error: LOADING }),
      ready: JSON.stringify({ text: '<frame id="1:2" name="Card"/>' }),
    });

    const response: any = await handlers.toolGetDesignContext({ nodeId: "1:2" });

    expect(response.isError).toBeUndefined();
    expect(textOf(response)).toContain('name="Card"');
  });

  test("a file that will never have the API fails at once with its reason", async () => {
    const reason = `${PLUGIN_API_UNAVAILABLE_PREFIX}you can only view this file`;
    const { handlers, calls } = harness({
      states: [{ ready: false, blocked: true }],
      missing: { error: reason },
    });
    const started = Date.now();

    const response: any = await handlers.toolGetFileInfo();

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("you can only view this file");
    expect(calls.probes).toBe(1);
    expect(calls.scripts).toBe(1);
    expect(Date.now() - started).toBeLessThan(400);
  });

  test("when the wait runs out the reason is reported, and the next call does not wait again", async () => {
    const failures = new Map<string, number>();
    const page: Page = { states: [{ ready: false, blocked: false }], missing: { error: LOADING } };

    const first = harness(page, {
      editorWaitMs: 600,
      editorWaitFailures: failures,
      fileKey: "abc",
    });
    const response: any = await first.handlers.toolGetFileInfo();
    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("has not finished loading");
    expect(first.calls.probes).toBeGreaterThan(0);
    expect(failures.has("abc")).toBe(true);

    // Plugins switched off by the organization look exactly like this for good:
    // every call would otherwise cost the full wait.
    const second = harness(page, {
      editorWaitMs: 600,
      editorWaitFailures: failures,
      fileKey: "abc",
    });
    const started = Date.now();
    await second.handlers.toolGetFileInfo();
    expect(second.calls.probes).toBe(0);
    expect(Date.now() - started).toBeLessThan(300);

    // Another file is not held back by it.
    const other = harness(page, {
      editorWaitMs: 600,
      editorWaitFailures: failures,
      fileKey: "xyz",
    });
    await other.handlers.toolGetFileInfo();
    expect(other.calls.probes).toBeGreaterThan(0);
  });

  test("an ordinary error is not mistaken for a missing API", () => {
    expect(pluginApiMissing({ error: "Node not found: 1:2" })).toBe(false);
    expect(
      pluginApiMissing(JSON.stringify({ text: `mentions ${PLUGIN_API_UNAVAILABLE_PREFIX}` })),
    ).toBe(false);
    expect(pluginApiMissing("not json at all")).toBe(false);
    expect(pluginApiMissing(undefined)).toBe(false);
    expect(pluginApiMissing({ error: LOADING })).toBe(true);
  });
});

describe("get_screenshot of a tab that is not in front", () => {
  test("without a nodeId it explains what works, and never captures or raises the window", async () => {
    const { handlers, calls } = harness({
      states: [{ ready: true, blocked: false }],
      missing: { error: "No node selected", noSelection: true },
      visible: false,
    });

    const response: any = await handlers.toolGetScreenshot({});

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("Pass a nodeId");
    expect(calls.capturePage).toBe(0);
  });
});

describe("a script Figma never answers", () => {
  test("names the missing animation frames when the window is not being drawn", async () => {
    const { handlers } = harness(
      { states: [{ ready: true, blocked: false }], missing: null, stall: true, frames: false },
      { scriptTimeoutMs: 200 },
    );

    const call = handlers.toolGetScreenshot({ nodeId: "1:2" });

    await expect(call).rejects.toThrow("no animation frames");
  });

  test("keeps the plain advice when frames are fine", async () => {
    const { handlers } = harness(
      { states: [{ ready: true, blocked: false }], missing: null, stall: true, frames: true },
      { scriptTimeoutMs: 200 },
    );

    const call = handlers.toolGetScreenshot({ nodeId: "1:2" });

    await expect(call).rejects.toThrow("may still be loading or busy");
  });
});
