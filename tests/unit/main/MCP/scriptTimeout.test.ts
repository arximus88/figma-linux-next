/**
 * A tool whose script Figma never answers gives up instead of hanging.
 *
 * Seen live: a raster exportAsync that never settled kept get_screenshot, and
 * the MCP client waiting on it, stuck with no error at all.
 */

import { describe, expect, test } from "bun:test";
import { ToolHandlers, type ToolContext } from "Main/MCP/handlers/ToolHandlers";

function handlers(execute: () => Promise<unknown>, scriptTimeoutMs: number) {
  const ctx: ToolContext = {
    viewProvider: { executeInBrowserView: execute, getActiveTabView: (): null => null } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    codeConnectMap: new Map(),
    assetStore: new Map(),
    getPort: () => 3845,
    getSaveBaseDir: () => "/tmp",
    scriptTimeoutMs,
  };
  return new ToolHandlers(ctx);
}

describe("script timeout", () => {
  test("a script that never settles fails after the limit with a reason", async () => {
    const never = () => new Promise(() => {});
    const started = Date.now();

    const call = handlers(never, 300).toolGetFileInfo();

    await expect(call).rejects.toThrow("Figma did not answer within");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("a script that answers in time is not affected", async () => {
    const quick = async () => JSON.stringify({ fileName: "mdx-plus" });

    const response: any = await handlers(quick, 300).toolGetFileInfo();

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("mdx-plus");
  });
});
