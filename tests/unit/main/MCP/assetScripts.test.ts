/**
 * download_assets / upload_assets in-page scripts against a fake Plugin API:
 * which parts of a design come out as SVG, which images come out raw, and
 * where an uploaded image lands.
 */

import { describe, expect, it } from "bun:test";

import { DOWNLOAD_ASSETS_SCRIPT, UPLOAD_ASSET_SCRIPT } from "Main/MCP/scripts/assets";

const run = (script: string, figma: any) =>
  new Function("window", `return (${script});`)({ figma });

function n(id: string, type: string, extra: Record<string, any> = {}): any {
  const node: any = { id, name: id, type, width: 24, height: 24, x: 0, y: 0, fills: [], ...extra };
  node.exportAsync = async (s: any) =>
    s.format === "SVG_STRING" ? `<svg id="${id}"/>` : new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  return node;
}

describe("download_assets", () => {
  function card() {
    // Card frame: an icon frame made of vectors, a photo rectangle, a text, a plain rectangle.
    const icon = n("2:1", "FRAME", {
      children: [n("2:2", "VECTOR"), n("2:3", "BOOLEAN_OPERATION")],
    });
    const photo = n("2:4", "RECTANGLE", { fills: [{ type: "IMAGE", imageHash: "jpeg-hash" }] });
    const sameImageAgain = n("2:5", "RECTANGLE", {
      fills: [{ type: "IMAGE", imageHash: "jpeg-hash" }],
    });
    const label = n("2:6", "TEXT");
    const divider = n("2:7", "RECTANGLE");
    const root = n("1:1", "FRAME", {
      name: "Card",
      children: [icon, photo, sameImageAgain, label, divider],
      exportSettings: [{ format: "JPG", constraint: { type: "SCALE", value: 2 } }],
    });
    const seen: any[] = [];
    const orig = root.exportAsync;
    root.exportAsync = async (s: any) => {
      seen.push(s);
      return orig(s);
    };
    const figma = {
      getNodeByIdAsync: async (id: string) => (id === "1:1" ? root : null),
      getImageByHash: (hash: string) => ({
        getBytesAsync: async () =>
          hash === "jpeg-hash" ? new Uint8Array([0xff, 0xd8, 0xff]) : new Uint8Array(),
        getSizeAsync: async () => ({ width: 800, height: 600 }),
      }),
    };
    return { figma, seen };
  }

  it("returns the node export, each image once with its real format, and icons as SVG", async () => {
    const { figma, seen } = card();
    const out = await run(DOWNLOAD_ASSETS_SCRIPT("1:1", { format: null, scale: null }), figma);
    // The node's own export settings decide when nothing is asked for.
    expect(out.export.format).toBe("jpg");
    expect(seen[0]).toEqual({ format: "JPG", constraint: { type: "SCALE", value: 2 } });
    expect(out.rawImages.map((i: any) => [i.imageHash, i.format, i.width])).toEqual([
      ["jpeg-hash", "jpeg", 800],
    ]);
    // The icon frame is one asset; its paths, the text and the plain rectangles are not.
    expect(out.svgAssets.map((s: any) => [s.nodeId, s.svg])).toEqual([["2:1", '<svg id="2:1"/>']]);
  });

  it("lets an explicit format and scale win over the node's settings", async () => {
    const { figma, seen } = card();
    const out = await run(DOWNLOAD_ASSETS_SCRIPT("1:1", { format: "png", scale: 3 }), figma);
    expect(seen[0]).toEqual({ format: "PNG", constraint: { type: "SCALE", value: 3 } });
    expect(out.export.scale).toBe(3);
  });

  it("reports a missing node", async () => {
    const { figma } = card();
    const out = await run(DOWNLOAD_ASSETS_SCRIPT("9:9", { format: null, scale: null }), figma);
    expect(out.error).toBe("Node not found: 9:9");
  });
});

describe("upload_assets placement", () => {
  function doc() {
    const page: any = {
      id: "0:1",
      type: "PAGE",
      children: [n("1:1", "FRAME", { x: 100, width: 300 })],
    };
    page.appendChild = (c: any) => page.children.push(c);
    const target = n("1:2", "RECTANGLE");
    const created: any[] = [];
    const figma: any = {
      currentPage: page,
      commitUndo: () => {},
      getNodeByIdAsync: async (id: string) => (id === "1:2" ? target : id === "0:1" ? page : null),
      createImage: (bytes: Uint8Array) => ({
        hash: `hash-${bytes.length}`,
        getSizeAsync: async () => ({ width: 64, height: 32 }),
      }),
      createRectangle: () => {
        const r = n(`5:${created.length + 1}`, "RECTANGLE");
        r.resize = (w: number, h: number) => {
          r.width = w;
          r.height = h;
        };
        created.push(r);
        return r;
      },
      createNodeFromSvg: (svg: string) => {
        const f = n("6:1", "FRAME", { svgSource: svg });
        created.push(f);
        return f;
      },
    };
    return { figma, page, target, created };
  }
  const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
  const PNG = [0x89, 0x50, 0x4e, 0x47, 1, 2];

  it("fills an existing node with the image", async () => {
    const { figma, target, created } = doc();
    const out = await run(
      UPLOAD_ASSET_SCRIPT(b64(PNG), "image/png", {
        targetNodeId: "1:2",
        scaleMode: "FIT",
        pageId: null,
      }),
      figma,
    );
    expect(out.targetNodeId).toBe("1:2");
    expect(target.fills).toEqual([{ type: "IMAGE", imageHash: "hash-6", scaleMode: "FIT" }]);
    expect(created).toHaveLength(0);
  });

  it("places a new image at its own size, right of the existing content", async () => {
    const { figma, page, created } = doc();
    const out = await run(
      UPLOAD_ASSET_SCRIPT(b64(PNG), "image/png", {
        targetNodeId: null,
        scaleMode: "FILL",
        pageId: null,
      }),
      figma,
    );
    const [rect] = created;
    expect([rect.width, rect.height, rect.x]).toEqual([64, 32, 500]);
    expect(page.children).toContain(rect);
    expect(out).toEqual({
      nodeId: rect.id,
      imageHash: "hash-6",
      width: 64,
      height: 32,
      pageId: "0:1",
    });
  });

  it("turns an SVG into vector nodes from its text", async () => {
    const { figma, created } = doc();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    const out = await run(
      UPLOAD_ASSET_SCRIPT(Buffer.from(svg).toString("base64"), "image/svg+xml", {
        targetNodeId: null,
        scaleMode: "FILL",
        pageId: null,
      }),
      figma,
    );
    expect(out.svg).toBe(true);
    expect(created[0].svgSource).toBe(svg);
  });

  it("refuses a target that does not exist instead of placing it elsewhere", async () => {
    const { figma, created } = doc();
    const out = await run(
      UPLOAD_ASSET_SCRIPT(b64(PNG), "image/png", {
        targetNodeId: "7:7",
        scaleMode: "FILL",
        pageId: null,
      }),
      figma,
    );
    expect(out.error).toBe("Target node not found: 7:7");
    expect(created).toHaveLength(0);
  });
});
