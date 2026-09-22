/**
 * get_screenshot: what it saves, where, and what it refuses to claim.
 *
 * Both behaviours under test here were reported as "the save reports success
 * but writes nothing":
 *
 *   - A node export that failed fell back to Electron's capturePage — a shot of
 *     the whole editor window — and returned it as a *success*, complete with a
 *     `savedTo`. A batch of node exports produced a pile of byte-identical
 *     window captures, every one of them reported fine.
 *   - A relative `savePath` was resolved against `process.cwd()`, which in a
 *     packaged app is wherever the launcher started the process. The write
 *     succeeded and `savedTo` was accurate — just nowhere near where the caller
 *     was looking.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolHandlers, type ToolContext } from "Main/MCP/handlers/ToolHandlers";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let tmpDir: string;
let saveBaseDir: string;

/** Text part of a tool response, parsed back into the meta object. */
function metaOf(response: any): Record<string, any> {
  const textPart = response.content.find((c: any) => c.type === "text");
  return textPart ? JSON.parse(textPart.text) : {};
}

interface HarnessOptions {
  /** What the in-page screenshot script resolves to. */
  execResult: any;
  /** Set when capturePage is expected to be reachable. */
  capturePage?: () => { toPNG: () => Buffer };
}

function makeHandlers({ execResult, capturePage }: HarnessOptions) {
  const calls = { exec: 0, capturePage: 0 };

  const ctx: ToolContext = {
    viewProvider: {
      executeInBrowserView: async () => {
        calls.exec++;
        return execResult;
      },
      getActiveTabView: () =>
        ({
          webContents: {
            capturePage: async () => {
              calls.capturePage++;
              return capturePage ? capturePage() : { toPNG: () => Buffer.from("png") };
            },
          },
        }) as any,
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    codeConnectMap: new Map(),
    assetStore: new Map(),
    getPort: () => 3845,
    getSaveBaseDir: () => saveBaseDir,
  };

  return { handlers: new ToolHandlers(ctx), calls };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-mcp-shot-"));
  saveBaseDir = path.join(tmpDir, "export-dir");
  fs.mkdirSync(saveBaseDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("get_screenshot: a failed node export does not silently become a window capture", () => {
  test("a nodeId that cannot be exported returns an error and saves nothing", async () => {
    const target = path.join(tmpDir, "node.png");
    const { handlers, calls } = makeHandlers({
      execResult: { error: "Figma Plugin API not available — ensure a file is open" },
    });

    const response: any = await handlers.toolGetScreenshot({
      nodeId: "342:8204",
      savePath: target,
    });

    expect(response.isError).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
    // The fallback must not even be attempted: it cannot answer the question.
    expect(calls.capturePage).toBe(0);
  });

  test("the error names the node and says the screenshot was not saved", async () => {
    const { handlers } = makeHandlers({ execResult: { error: "Node not found: 1:2" } });
    const response: any = await handlers.toolGetScreenshot({ nodeId: "1:2" });

    const text = response.content.map((c: any) => c.text).join("\n");
    expect(text).toContain("1:2");
    expect(text.toLowerCase()).toContain("not saved");
  });

  test("with no nodeId the window capture is still offered, but marked degraded", async () => {
    const target = path.join(tmpDir, "window.png");
    const { handlers, calls } = makeHandlers({
      execResult: { error: "No node selected" },
      capturePage: () => ({ toPNG: () => Buffer.from(PNG_BASE64, "base64") }),
    });

    const response: any = await handlers.toolGetScreenshot({ savePath: target });

    expect(response.isError).toBeUndefined();
    expect(calls.capturePage).toBe(1);

    const meta = metaOf(response);
    expect(meta.degraded).toBeTruthy();
    expect(meta.nodeName).toContain("capturePage fallback");
    expect(meta.savedTo).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  test("a successful node export is not marked degraded", async () => {
    const { handlers, calls } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame 280" },
    });

    const response: any = await handlers.toolGetScreenshot({ nodeId: "1:2" });

    expect(calls.capturePage).toBe(0);
    const meta = metaOf(response);
    expect(meta.degraded).toBeUndefined();
    expect(meta.nodeName).toBe("Frame 280");
  });
});

describe("get_screenshot: where a relative savePath lands", () => {
  test("a relative path resolves against the export directory, not the cwd", async () => {
    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    const response: any = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      savePath: "shots/frame.png",
    });

    const meta = metaOf(response);
    const expected = path.join(saveBaseDir, "shots", "frame.png");

    expect(meta.savedTo).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    // And it is emphatically not next to wherever the process was started.
    expect(meta.savedTo).not.toBe(path.resolve(process.cwd(), "shots/frame.png"));
  });

  test("the response says which directory a relative path was resolved from", async () => {
    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: "frame.png" }));
    expect(meta.resolvedFrom).toBe(saveBaseDir);
  });

  test("an absolute path is used verbatim and reported without resolvedFrom", async () => {
    const target = path.join(tmpDir, "exact", "here.png");
    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: target }));

    expect(meta.savedTo).toBe(target);
    expect(meta.resolvedFrom).toBeUndefined();
    expect(fs.existsSync(target)).toBe(true);
  });

  test("missing directories are created", async () => {
    const target = path.join(tmpDir, "a", "b", "c", "deep.png");
    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: target });
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe("get_screenshot: a failed write never reports success", () => {
  test("an unwritable destination reports saveError and no savedTo", async () => {
    // A path whose parent is a regular file: mkdir cannot create it.
    const blocker = path.join(tmpDir, "not-a-directory");
    fs.writeFileSync(blocker, "");
    const target = path.join(blocker, "nested", "shot.png");

    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: target }));

    expect(meta.savedTo).toBeUndefined();
    expect(meta.saveError).toBeTruthy();
    // The failing path is named, so the caller can see where it tried to write.
    expect(meta.saveError).toContain(target);
  });

  test("no savePath means no save claim at all", async () => {
    const { handlers } = makeHandlers({
      execResult: { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" },
    });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2" }));

    expect(meta.savedTo).toBeUndefined();
    expect(meta.saveError).toBeUndefined();
  });
});
