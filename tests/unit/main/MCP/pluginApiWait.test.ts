/**
 * Tool scripts wait, in the page, for Figma's Plugin API.
 *
 * Figma installs `window.figma` a second or two after a tab comes to the front
 * or a file finishes loading. A tool call in that gap used to fail at once with
 * "not available", though a retry a moment later would have worked.
 */

import { describe, expect, test } from "bun:test";
import { ToolHandlers, type ToolContext } from "Main/MCP/handlers/ToolHandlers";
import { PLUGIN_API_STATE, withPluginApiWait } from "Main/MCP/scripts/helpers";

const TEAM_FILE = { can_edit: true, editor_type: "design", team_id: "1" };

/** A page whose `window.figma` appears after `figmaAfterMs` (never when null). */
function page(figmaAfterMs: number | null, editingFile: object = TEAM_FILE) {
  const window: Record<string, unknown> = { INITIAL_OPTIONS: { editing_file: editingFile } };
  if (figmaAfterMs !== null) setTimeout(() => (window.figma = { root: {} }), figmaAfterMs);
  return {
    run: (script: string) =>
      new Function("window", "document", "location", `return ${script};`)(
        window,
        { visibilityState: "visible" },
        { pathname: "/design/abc", search: "" },
      ),
  };
}

/** What the tool would see: whether window.figma was there when it ran. */
const PROBE = `(function () { return window.figma ? "had figma" : "no figma"; })()`;

describe("withPluginApiWait", () => {
  test("a script called before the API is installed runs once it is there", async () => {
    const started = Date.now();
    expect(await page(400).run(withPluginApiWait(PROBE, 3000))).toBe("had figma");
    expect(Date.now() - started).toBeLessThan(1500);
  });

  test("a ready page runs the script straight away", async () => {
    const p = page(0);
    await new Promise((r) => setTimeout(r, 10));
    const started = Date.now();
    expect(await p.run(withPluginApiWait(PROBE, 3000))).toBe("had figma");
    expect(Date.now() - started).toBeLessThan(100);
  });

  test("a view-only file is not waited on: the API is never coming", async () => {
    const started = Date.now();
    const result = await page(null, { ...TEAM_FILE, can_edit: false }).run(
      withPluginApiWait(PROBE, 3000),
    );
    expect(result).toBe("no figma");
    expect(Date.now() - started).toBeLessThan(100);
  });

  test("the wait is bounded, then the script runs and reports", async () => {
    const started = Date.now();
    expect(await page(null).run(withPluginApiWait(PROBE, 600))).toBe("no figma");
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(550);
    expect(waited).toBeLessThan(1200);
  });
});

describe("ToolHandlers", () => {
  /** Run a tool; the page reports `states` in turn for the Plugin API (last repeats). */
  async function run(states: string[], pluginApiWaitMs = 3000) {
    const scripts: string[] = [];
    let probes = 0;
    let wakes = 0;
    const ctx: ToolContext = {
      viewProvider: {
        executeInBrowserView: async (script: string) => {
          if (script === PLUGIN_API_STATE) return states[Math.min(probes++, states.length - 1)];
          scripts.push(script);
          return JSON.stringify({ ok: true });
        },
        getActiveTabView: (): null => null,
        wakeActiveTab: () => {
          wakes++;
        },
      } as any,
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      codeConnectMap: new Map(),
      assetStore: new Map(),
      getPort: () => 3845,
      getSaveBaseDir: () => "/tmp",
      pluginApiWaitMs,
    };
    const started = Date.now();
    await new ToolHandlers(ctx).toolGetFileInfo();
    return { scripts, probes, wakes, took: Date.now() - started };
  }

  // Found live: the tab in front at launch, or reloaded in place, loads while
  // visible and Figma never installs window.figma until it is hidden and shown.
  test("a pending API wakes the tab and runs the script once it is ready", async () => {
    const { scripts, wakes } = await run(["pending", "pending", "ready"]);
    expect(wakes).toBe(1);
    expect(scripts).toHaveLength(1);
  });

  // Also found live: a wake before the file has loaded does nothing.
  test("the tab is woken again while the API stays pending, about once a second", async () => {
    const { wakes } = await run(["pending", "pending", "pending", "pending", "pending", "ready"]);
    expect(wakes).toBe(2);
  });

  test("a ready API leaves the tab alone", async () => {
    const { wakes, probes } = await run(["ready"]);
    expect(wakes).toBe(0);
    expect(probes).toBe(1);
  });

  test("a blocked file is not woken or waited on", async () => {
    const { wakes, took } = await run(["blocked"]);
    expect(wakes).toBe(0);
    expect(took).toBeLessThan(100);
  });

  test("the whole wait stays within the limit", async () => {
    const { took, scripts } = await run(["pending"], 700);
    expect(took).toBeGreaterThanOrEqual(650);
    expect(took).toBeLessThan(1200);
    expect(scripts).toHaveLength(1);
  });
});
