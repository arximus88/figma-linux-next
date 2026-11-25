/**
 * get_screenshot must never answer with more than an MCP client accepts (#93).
 *
 * The Pi coding agent rejects any response over 16 MiB, and the call failed
 * with "MCP JSON response exceeds 16777216 bytes" — nothing the agent could
 * act on. Four ways in, each covered here:
 *
 *   - `maxDimension` accepted up to 65536;
 *   - an explicit `scale` skipped the cap altogether;
 *   - a page (no width/height) exported at 1x whatever `maxDimension` said;
 *   - whatever came out was inlined, the capturePage fallback included.
 *
 * The in-page script runs for real here, against a fake `figma` whose nodes
 * record the scale they were exported at.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type ToolContext, ToolHandlers } from "Main/MCP/handlers/ToolHandlers";
import { TOOLS } from "Main/MCP/tools/definitions";
import {
  INLINE_IMAGE_MAX_BASE64,
  INLINE_MAX_EDGE,
  SCREENSHOT_MAX_EDGE,
} from "Main/MCP/utils/screenshotLimits";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** Valid base64 just over the inline limit. */
const HUGE_BASE64 = "A".repeat(INLINE_IMAGE_MAX_BASE64 + 4);

let tmpDir: string;
let saveBaseDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-mcp-limits-"));
  saveBaseDir = path.join(tmpDir, "export-dir");
  fs.mkdirSync(saveBaseDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

interface FakeNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: FakeNode[];
  exportAsync?: (opts: any) => Promise<Uint8Array>;
}

/** A node whose exportAsync records the scale it was asked for. */
function node(partial: Omit<FakeNode, "exportAsync">, exports: number[]): FakeNode {
  return {
    ...partial,
    exportAsync: async (opts: any) => {
      exports.push(opts.constraint.value);
      return new Uint8Array([1, 2, 3]);
    },
  };
}

function frame(id: string, x: number, y: number, width: number, height: number): FakeNode {
  return {
    id,
    name: id,
    type: "FRAME",
    width,
    height,
    absoluteBoundingBox: { x, y, width, height },
  };
}

/** Handlers whose exec runs the real script against `nodes` (or answers `execResult`). */
function makeHandlers(
  opts: {
    nodes?: Record<string, FakeNode>;
    execResult?: any;
    capture?: { width: number; height: number; base64?: string };
    isHostVisible?: (p: string) => boolean;
  } = {},
) {
  const calls = { exec: 0, resizedTo: null as null | { width: number; height: number } };
  const fakeFigma = {
    getNodeByIdAsync: async (id: string) => opts.nodes?.[id] ?? null,
    currentPage: { selection: [] as FakeNode[] },
  };
  const ctx: ToolContext = {
    viewProvider: {
      executeInBrowserView: async (script: string) => {
        calls.exec++;
        if (opts.execResult !== undefined) return opts.execResult;
        return new Function("window", "btoa", `return (${script});`)({ figma: fakeFigma }, btoa);
      },
      getActiveTabView: () =>
        ({
          getVisible: () => true,
          webContents: {
            capturePage: async () => {
              const c = opts.capture ?? { width: 1, height: 1 };
              const image = (w: number, h: number): any => ({
                getSize: () => ({ width: w, height: h }),
                resize: (size: { width: number; height: number }) => {
                  calls.resizedTo = { width: size.width, height: size.height };
                  return image(size.width, size.height);
                },
                toPNG: () => Buffer.from(c.base64 ?? PNG_BASE64, "base64"),
              });
              return image(c.width, c.height);
            },
          },
        }) as any,
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    codeConnectMap: new Map(),
    assetStore: new Map(),
    getPort: () => 3845,
    getSaveBaseDir: () => saveBaseDir,
    isHostVisible: opts.isHostVisible,
    editorWaitMs: 0,
  };
  return { handlers: new ToolHandlers(ctx), calls };
}

function metaOf(response: any): Record<string, any> {
  const textPart = response.content.find((c: any) => c.type === "text");
  return JSON.parse(textPart.text);
}

const kinds = (response: any) => response.content.map((c: any) => c.type);
const textOf = (response: any) => response.content.map((c: any) => c.text ?? "").join("\n");

describe("get_screenshot: the export size is bounded whatever is asked", () => {
  test("maxDimension 65536 on a 20000 px frame exports at the hard cap", async () => {
    const exports: number[] = [];
    const big = node(frame("1:2", 0, 0, 20000, 10000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": big } });

    const meta = metaOf(
      await handlers.toolGetScreenshot({ nodeId: "1:2", maxDimension: 65536, savePath: "a.png" }),
    );

    expect(exports).toEqual([SCREENSHOT_MAX_EDGE / 20000]);
    expect(meta.width).toBe(SCREENSHOT_MAX_EDGE);
  });

  test("scale 4 on a large frame no longer bypasses the cap", async () => {
    const exports: number[] = [];
    const big = node(frame("1:2", 0, 0, 10000, 4000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": big } });

    const meta = metaOf(
      await handlers.toolGetScreenshot({ nodeId: "1:2", scale: 4, savePath: "a.png" }),
    );

    expect(exports[0]).toBeCloseTo(SCREENSHOT_MAX_EDGE / 10000, 6);
    expect(meta.width).toBe(SCREENSHOT_MAX_EDGE);
    expect(meta.requestedScale).toBe(4);
  });

  test("scale together with maxDimension: maxDimension wins when smaller", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 1000, 500), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const meta = metaOf(
      await handlers.toolGetScreenshot({ nodeId: "1:2", scale: 2, maxDimension: 500 }),
    );

    expect(exports).toEqual([0.5]);
    expect(meta.width).toBe(500);
  });

  test("a scale that fits is used as given and not reported as capped", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 400, 300), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", scale: 3 }));

    expect(exports).toEqual([3]);
    expect(meta.requestedScale).toBeUndefined();
  });

  test("a small node still renders at 2x by default", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 100, 50), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    await handlers.toolGetScreenshot({ nodeId: "1:2" });
    expect(exports).toEqual([2]);
  });

  test("content overflowing a frame counts: render bounds larger than the size", async () => {
    const exports: number[] = [];
    const n = node(
      {
        ...frame("1:2", 0, 0, 500, 500),
        // A child sticks out to 4000 px and clipsContent is off.
        absoluteBoundingBox: { x: 0, y: 0, width: 4000, height: 500 },
      },
      exports,
    );
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    await handlers.toolGetScreenshot({ nodeId: "1:2", maxDimension: 2000 });
    expect(exports).toEqual([0.5]);
  });
});

describe("get_screenshot: an inline image stays within 2000 px (Claude's many-image limit)", () => {
  test("maxDimension 4000 inline exports at 2000 and says how to get the full size", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 4000, 1000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const response = await handlers.toolGetScreenshot({ nodeId: "1:2", maxDimension: 4000 });

    expect(kinds(response)).toEqual(["image", "text"]);
    expect(exports).toEqual([INLINE_MAX_EDGE / 4000]);
    const meta = metaOf(response);
    expect(meta.width).toBe(INLINE_MAX_EDGE);
    expect(meta.note).toContain("savePath");
  });

  test("scale 1 on a 4000 px frame inline is capped too", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 4000, 1000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", scale: 1 }));

    expect(meta.width).toBe(INLINE_MAX_EDGE);
    expect(meta.requestedScale).toBe(1);
  });

  test("the same request with savePath keeps the full 4000 px", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 4000, 1000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const response = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      maxDimension: 4000,
      savePath: "full.png",
    });

    expect(kinds(response)).toEqual(["text"]);
    expect(exports).toEqual([1]);
    expect(metaOf(response).width).toBe(4000);
  });

  test("savePath plus enableBase64Response true sends the image, so it is capped", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 4000, 1000), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const response = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      maxDimension: 4000,
      savePath: "both.png",
      enableBase64Response: true,
    });

    expect(kinds(response)).toEqual(["image", "text"]);
    expect(metaOf(response).width).toBe(INLINE_MAX_EDGE);
  });

  test("a frame that fits gets no note", async () => {
    const exports: number[] = [];
    const n = node(frame("1:2", 0, 0, 800, 600), exports);
    const { handlers } = makeHandlers({ nodes: { "1:2": n } });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", maxDimension: 4000 }));

    // 2x of 800 is 1600: under the inline cap.
    expect(exports).toEqual([2]);
    expect(meta.note).toBeUndefined();
  });

  test("the capturePage fallback inline is capped at 2000 too", async () => {
    const { handlers, calls } = makeHandlers({
      execResult: { error: "No node selected", noSelection: true },
      capture: { width: 4400, height: 2600 },
    });

    await handlers.toolGetScreenshot({ maxDimension: 8000 });

    expect(calls.resizedTo).toEqual({ width: INLINE_MAX_EDGE, height: 1182 });
  });
});

describe("get_screenshot: a page is sized by what is on it", () => {
  test("a page with desktop frames respects maxDimension (it used to export at 1x)", async () => {
    const exports: number[] = [];
    const page = node(
      {
        id: "95:800",
        name: "Page 1",
        type: "PAGE",
        children: [frame("1:1", 0, 0, 1440, 3000), frame("1:2", 2000, 0, 1440, 6000)],
      },
      exports,
    );
    const { handlers } = makeHandlers({ nodes: { "95:800": page } });

    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "95:800", maxDimension: 2000 }));

    // Union: 3440 x 6000. Longer edge 6000 → 2000.
    expect(exports[0]).toBeCloseTo(2000 / 6000, 6);
    expect(meta.height).toBe(2000);
    expect(meta.original_width).toBe(3440);
    expect(meta.original_height).toBe(6000);
  });

  test("an empty page is an error, not a 1x export", async () => {
    const exports: number[] = [];
    const page = node({ id: "95:800", name: "Empty", type: "PAGE", children: [] }, exports);
    const { handlers } = makeHandlers({ nodes: { "95:800": page } });

    const response: any = await handlers.toolGetScreenshot({ nodeId: "95:800" });

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("nothing on it");
    expect(exports).toEqual([]);
  });
});

describe("get_screenshot: nothing over the inline limit goes inline", () => {
  const huge = { base64: HUGE_BASE64, nodeId: "1:2", nodeName: "Huge" };

  test("without savePath a huge PNG is saved to the export directory and its path returned", async () => {
    const { handlers } = makeHandlers({ execResult: huge });

    const response: any = await handlers.toolGetScreenshot({ nodeId: "1:2" });

    expect(response.isError).toBeUndefined();
    expect(kinds(response)).toEqual(["text"]);
    const meta = metaOf(response);
    expect(meta.savedTo.startsWith(path.join(saveBaseDir, "mcp-screenshots"))).toBe(true);
    expect(fs.statSync(meta.savedTo).size).toBe(Buffer.from(HUGE_BASE64, "base64").length);
    expect(meta.note).toContain("Too large");
  });

  test("the whole response stays under 16 MiB", async () => {
    const { handlers } = makeHandlers({ execResult: huge });
    const response = await handlers.toolGetScreenshot({ nodeId: "1:2" });
    expect(JSON.stringify(response).length).toBeLessThan(16 * 1024 * 1024);
  });

  test("a huge PNG that cannot be saved is an error naming the size, not an inline image", async () => {
    // The export directory is a regular file: nothing can be written under it.
    fs.rmSync(saveBaseDir, { recursive: true });
    fs.writeFileSync(saveBaseDir, "");
    const { handlers } = makeHandlers({ execResult: huge });

    const response: any = await handlers.toolGetScreenshot({ nodeId: "1:2" });

    expect(response.isError).toBe(true);
    expect(kinds(response)).toEqual(["text"]);
    expect(textOf(response)).toContain("MiB");
    expect(textOf(response)).toContain("maxDimension");
  });

  test("a failed savePath write does not fall back to inlining a huge PNG", async () => {
    const blocker = path.join(tmpDir, "not-a-dir");
    fs.writeFileSync(blocker, "");
    const { handlers } = makeHandlers({ execResult: huge });

    const response: any = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      savePath: path.join(blocker, "shot.png"),
    });

    expect(response.isError).toBe(true);
    expect(kinds(response)).toEqual(["text"]);
  });

  test("the capturePage fallback is capped by maxDimension", async () => {
    const { handlers, calls } = makeHandlers({
      execResult: { error: "No node selected", noSelection: true },
      capture: { width: 4400, height: 2600 },
    });

    const meta = metaOf(await handlers.toolGetScreenshot({}));

    expect(calls.resizedTo).toEqual({ width: 1024, height: 605 });
    expect(meta.width).toBe(1024);
    expect(meta.original_width).toBe(4400);
  });

  test("a capturePage fallback over the inline limit is saved, not inlined", async () => {
    const { handlers } = makeHandlers({
      execResult: { error: "No node selected", noSelection: true },
      capture: { width: 1, height: 1, base64: HUGE_BASE64 },
    });

    const response: any = await handlers.toolGetScreenshot({});

    expect(kinds(response)).toEqual(["text"]);
    expect(fs.existsSync(metaOf(response).savedTo)).toBe(true);
  });
});

describe("get_screenshot: enableBase64Response (Figma's remote parameter)", () => {
  const ok = { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" };

  test("true is accepted and answers inline, as the default does", async () => {
    const { handlers } = makeHandlers({ execResult: ok });
    const response = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      enableBase64Response: true,
    });
    expect(kinds(response)).toEqual(["image", "text"]);
  });

  test("false saves to the export directory and returns only the path", async () => {
    const { handlers } = makeHandlers({ execResult: ok });
    const response = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      enableBase64Response: false,
    });
    expect(kinds(response)).toEqual(["text"]);
    const meta = metaOf(response);
    expect(meta.savedTo.startsWith(saveBaseDir)).toBe(true);
    expect(fs.readFileSync(meta.savedTo).toString("base64")).toBe(PNG_BASE64);
  });

  test("true with savePath returns the image and the path", async () => {
    const target = path.join(tmpDir, "both.png");
    const { handlers } = makeHandlers({ execResult: ok });
    const response = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      savePath: target,
      enableBase64Response: true,
    });
    expect(kinds(response)).toEqual(["image", "text"]);
    expect(metaOf(response).savedTo).toBe(target);
  });

  test("the schema lists it", () => {
    const tool = TOOLS.find((t) => t.name === "get_screenshot")!;
    expect((tool.inputSchema.properties as any).enableBase64Response.type).toBe("boolean");
  });
});

describe("get_screenshot: the description tells agents the limits", () => {
  const tool = TOOLS.find((t) => t.name === "get_screenshot")!;

  test("it states the inline limits and the Slides support", () => {
    expect(tool.description).toContain("12 MiB");
    expect(tool.description).toContain(`${INLINE_MAX_EDGE} px when the image is sent inline`);
    expect(tool.description).toContain("Slides");
  });

  test("maxDimension's schema maximum is the hard cap, not 65536", () => {
    expect((tool.inputSchema.properties as any).maxDimension.maximum).toBe(SCREENSHOT_MAX_EDGE);
  });
});

describe("savePath the host cannot see (Flatpak's private /tmp)", () => {
  const ok = { base64: PNG_BASE64, nodeId: "1:2", nodeName: "Frame" };
  // Only the export directory is shared with the host, as a Flatpak grant would.
  const visible = (p: string) => p.startsWith(saveBaseDir);

  test("get_screenshot rejects /tmp before exporting and writes nothing", async () => {
    const target = path.join(tmpDir, "private.png");
    const { handlers, calls } = makeHandlers({ execResult: ok, isHostVisible: visible });

    const response: any = await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: target });

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain(target);
    expect(textOf(response)).toContain("Flatpak");
    expect(fs.existsSync(target)).toBe(false);
    expect(calls.exec).toBe(0);
  });

  test("a relative path, which lands in the shared export directory, still works", async () => {
    const { handlers } = makeHandlers({ execResult: ok, isHostVisible: visible });
    const meta = metaOf(await handlers.toolGetScreenshot({ nodeId: "1:2", savePath: "a.png" }));
    expect(meta.savedTo).toBe(path.join(saveBaseDir, "a.png"));
  });

  test("a ~/ path means the home directory, not a folder named ~ in the export dir", async () => {
    const { handlers, calls } = makeHandlers({ execResult: ok, isHostVisible: visible });
    const response: any = await handlers.toolGetScreenshot({
      nodeId: "1:2",
      savePath: "~/fln-tilde/x.png",
    });
    // Home is not shared in this sandbox, so the expanded path is rejected by name.
    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain(path.join(os.homedir(), "fln-tilde", "x.png"));
    expect(textOf(response)).not.toContain(`${path.sep}~${path.sep}`);
    expect(calls.exec).toBe(0);
  });

  test("figma_ai_generate_image rejects it before spending credits", async () => {
    const { handlers, calls } = makeHandlers({ execResult: {}, isHostVisible: visible });

    const response: any = await handlers.toolFigmaAiGenerateImage({
      prompt: "a cat",
      savePath: "/tmp/cat.png",
    });

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain("/tmp/cat.png");
    expect(calls.exec).toBe(0);
  });

  test("figma_ai_edit_image rejects it before spending credits", async () => {
    const { handlers, calls } = makeHandlers({ execResult: {}, isHostVisible: visible });

    const response: any = await handlers.toolFigmaAiEditImage({
      nodeId: "1:2",
      operation: "upscale",
      savePath: "/tmp/up.png",
    });

    expect(response.isError).toBe(true);
    expect(calls.exec).toBe(0);
  });
});
