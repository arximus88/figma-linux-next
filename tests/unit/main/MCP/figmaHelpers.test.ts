/**
 * The remote use_figma helpers (scripts/figmaHelpers.ts) run through the real
 * use_figma wrapper against a fake page API shaped like the one measured in the
 * app on 2026-11-06: `figma` is frozen, nodes are non-extensible, every node
 * type has its own prototype with non-writable methods, and the prototypes
 * accept new properties. Expected outputs follow a probe of Figma's remote
 * runtime the same day (createAutoLayout defaults, tree() format, QueryResult
 * JSON).
 */

import { describe, expect, it } from "bun:test";

import { NODE_HELPER_PATTERN, USE_FIGMA_MAX_IMAGES } from "Main/MCP/scripts/figmaHelpers";
import { USE_FIGMA_CODE_SCRIPT, useFigmaContent } from "Main/MCP/scripts/useFigmaCode";
import { withHint } from "Main/MCP/utils/errorHints";

interface State {
  id: string;
  type: string;
  name: string;
  parent: any;
  removed: boolean;
  children: any[] | null;
  x: number;
  y: number;
  width: number;
  height: number;
  [k: string]: any;
}

const PLAIN = ["name", "x", "y", "opacity", "layoutMode", "itemSpacing", "fills", "visible"];
const CONTAINERS = new Set([
  "PAGE",
  "DOCUMENT",
  "FRAME",
  "COMPONENT",
  "INSTANCE",
  "GROUP",
  "SECTION",
]);

function fakePage() {
  let n = 0;
  const protos = new Map<string, object>();
  const created: string[] = [];
  const exports: any[] = [];
  const log: string[] = [];
  const shared = new Map<string, string>();

  const detach = (node: any) => {
    const p = node.parent;
    if (p?._s.children) p._s.children.splice(p._s.children.indexOf(node), 1);
  };
  function protoFor(type: string) {
    const known = protos.get(type);
    if (known) return known;
    const P: any = {};
    const method = (name: string, value: (...a: any[]) => any) =>
      Object.defineProperty(P, name, { value, writable: false, configurable: false });
    const field = (name: string, set = true) =>
      Object.defineProperty(P, name, {
        get(this: any) {
          return this._s[name];
        },
        set: set
          ? function (this: any, v: any) {
              log.push(`${this._s.type}.${name}`);
              this._s[name] = v;
            }
          : undefined,
        configurable: false,
      });
    for (const f of PLAIN) field(f);
    for (const f of ["type", "removed", "parent", "width", "height"]) field(f, false);
    Object.defineProperty(P, "children", {
      get(this: any) {
        return this._s.children ? Object.freeze([...this._s.children]) : undefined;
      },
      configurable: false,
    });
    for (const f of ["primaryAxisSizingMode", "counterAxisSizingMode"]) field(f);
    Object.defineProperty(P, "absoluteBoundingBox", {
      get(this: any) {
        return { x: this._s.x, y: this._s.y, width: this._s.width, height: this._s.height };
      },
      configurable: false,
    });
    method("remove", function (this: any) {
      detach(this);
      this._s.removed = true;
    });
    method("resize", function (this: any, w: number, h: number) {
      log.push(`${this._s.type}.resize`);
      this._s.width = w;
      this._s.height = h;
    });
    method("appendChild", function (this: any, c: any) {
      detach(c);
      c._s.parent = this;
      this._s.children.push(c);
    });
    method("exportAsync", async function (this: any, s: any) {
      exports.push({ id: this.id, ...s });
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    });
    if (type === "COMPONENT")
      method("createInstance", function (this: any) {
        return make("INSTANCE", this._s.parent);
      });
    protos.set(type, P);
    return P;
  }
  function make(type: string, parent: any, extra: Partial<State> = {}): any {
    const s: State = {
      id: `${type === "PAGE" ? 0 : 1}:${++n}`,
      type,
      name: type === "FRAME" ? "Frame" : type[0] + type.slice(1).toLowerCase(),
      parent: null,
      removed: false,
      children: CONTAINERS.has(type) ? [] : null,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      visible: true,
      ...extra,
    };
    const node = Object.create(protoFor(type));
    Object.defineProperty(node, "id", { value: s.id, enumerable: true });
    Object.defineProperty(node, "_s", { value: s });
    Object.preventExtensions(node);
    if (parent) parent.appendChild(node);
    return node;
  }

  const doc = make("DOCUMENT", null, { id: "0:0" });
  const page1 = make("PAGE", doc, { name: "Page 1" });
  const page2 = make("PAGE", doc, { name: "Page 2" });
  let current = page1;
  const creator = (type: string) => () => {
    created.push(type);
    return make(type, current);
  };
  const byId = (id: string, from: any = doc): any => {
    if (from.id === id) return from;
    for (const c of from._s.children ?? []) {
      const hit = byId(id, c);
      if (hit) return hit;
    }
    return null;
  };
  const figma: any = Object.freeze({
    root: Object.assign(doc, {}),
    get currentPage() {
      return current;
    },
    set currentPage(p: any) {
      current = p;
    },
    setCurrentPageAsync: async (p: any) => {
      current = p;
    },
    getNodeByIdAsync: async (id: string) => byId(id),
    createFrame: creator("FRAME"),
    createRectangle: creator("RECTANGLE"),
    createText: creator("TEXT"),
    createComponent: creator("COMPONENT"),
    commitUndo: () => {},
    triggerUndo: () => {},
  });
  // The document root also carries shared plugin data for the undo marker.
  Object.defineProperty(protoFor("DOCUMENT"), "getSharedPluginData", {
    value: (ns: string, k: string) => shared.get(`${ns}/${k}`) ?? "",
  });
  Object.defineProperty(protoFor("DOCUMENT"), "setSharedPluginData", {
    value: (ns: string, k: string, v: string) => shared.set(`${ns}/${k}`, v),
  });
  return { figma, doc, page1, page2, make, created, exports, log };
}

async function run(code: string, figma: any, window: any = { figma }): Promise<any> {
  return new Function("window", `return (${USE_FIGMA_CODE_SCRIPT(code)});`)(window);
}
const value = (out: any) => {
  if (out.error) throw new Error(out.error);
  return JSON.parse(out.result);
};

describe("remote use_figma helpers: figma.createAutoLayout", () => {
  it("is a frame with the layout mode set and both axes hugging, like the remote one", async () => {
    const { figma } = fakePage();
    const v = value(
      await run(
        `const a = figma.createAutoLayout();
         const b = figma.createAutoLayout("VERTICAL", { name: "Col", itemSpacing: 8 });
         const c = figma.createAutoLayout({ name: "Card" });
         return [a, b, c].map(f => [f.type, f.name, f.layoutMode, f.primaryAxisSizingMode, f.counterAxisSizingMode, f.itemSpacing, f.parent.name]);`,
        figma,
      ),
    );
    expect(v).toEqual([
      ["FRAME", "Frame", "HORIZONTAL", "AUTO", "AUTO", null, "Page 1"],
      ["FRAME", "Col", "VERTICAL", "AUTO", "AUTO", 8, "Page 1"],
      ["FRAME", "Card", "HORIZONTAL", "AUTO", "AUTO", null, "Page 1"],
    ]);
  });

  it("works although the page's figma is frozen, and the real API still answers through it", async () => {
    const { figma, page2 } = fakePage();
    expect(Object.isFrozen(figma)).toBe(true);
    const v = value(
      await run(
        `await figma.setCurrentPageAsync(await figma.getNodeByIdAsync("${page2.id}"));
         return [figma.currentPage.name, typeof figma.createAutoLayout, "createAutoLayout" in figma];`,
        figma,
      ),
    );
    expect(v).toEqual(["Page 2", "function", true]);
  });

  it("leaves a native createAutoLayout alone if Figma ever ships one", async () => {
    const { figma: base } = fakePage();
    const figma = Object.freeze({ ...base, createAutoLayout: () => "native" });
    expect(value(await run("return figma.createAutoLayout();", figma))).toBe("native");
  });
});

describe("remote use_figma helpers: node.set", () => {
  it("returns the node, applies layoutMode first and routes width/height through resize", async () => {
    const { figma, log } = fakePage();
    const v = value(
      await run(
        `const r = figma.createFrame();
         const same = r.set({ width: 40, name: "R", height: 20, layoutMode: "VERTICAL" }) === r;
         return [same, r.width, r.height, r.name, r.layoutMode];`,
        figma,
      ),
    );
    expect(v).toEqual([true, 40, 20, "R", "VERTICAL"]);
    expect(log).toEqual(["FRAME.layoutMode", "FRAME.resize", "FRAME.name"]);
  });

  it("is there on a type the code met only by walking the current page", async () => {
    const { figma, page1, make } = fakePage();
    const frame = make("FRAME", page1);
    make("TEXT", frame, { name: "Title" });
    const v = value(
      await run(
        `const t = figma.currentPage.children[0].children[0]; t.set({ name: "Heading" }); return t.name;`,
        figma,
      ),
    );
    expect(v).toBe("Heading");
  });

  it("is there on an instance made by component.createInstance(), which no figma.* call returns", async () => {
    const { figma, page1, created } = fakePage();
    const v = value(
      await run(
        `const c = figma.createComponent(); const i = c.createInstance(); i.set({ name: "Btn" }); return [i.type, i.name];`,
        figma,
      ),
    );
    expect(v).toEqual(["INSTANCE", "Btn"]);
    // The type probe ran (it is what met INSTANCE) and cleaned up after itself:
    // only the component and instance the code made are left on the page.
    expect(created.length).toBeGreaterThan(1);
    expect(page1.children.map((c: any) => c.type)).toEqual(["COMPONENT", "INSTANCE"]);
  });

  it("does not probe when the code uses no node helper", async () => {
    const { figma, created } = fakePage();
    await run("const r = figma.createRectangle(); r.name = 'x'; return r.id;", figma);
    expect(created).toEqual(["RECTANGLE"]);
  });

  it("does not probe when there is no undo to take the probe back", async () => {
    const { figma: base, created } = fakePage();
    const figma = Object.freeze({
      ...base,
      commitUndo: () => {
        throw new Error("not supported");
      },
    });
    await run("return typeof figma.currentPage.query;", figma);
    expect(created).toEqual([]);
  });

  it("probes once per page, not on every call", async () => {
    const { figma, created } = fakePage();
    const window = { figma };
    await run("return figma.currentPage.query('FRAME').length;", figma, window);
    const after = created.length;
    await run("return figma.currentPage.query('FRAME').length;", figma, window);
    expect(created.length).toBe(after);
  });
});

describe("remote use_figma helpers: query and matches", () => {
  function scene() {
    const env = fakePage();
    const { page1, make } = env;
    const card1 = make("FRAME", page1, { name: "Card A" });
    make("TEXT", card1, { name: "Title" });
    make("RECTANGLE", card1, { name: "Divider" });
    make("TEXT", card1, { name: "Body", visible: false });
    const card2 = make("FRAME", page1, { name: "Card B" });
    const inner = make("FRAME", card2, { name: "Row" });
    make("TEXT", inner, { name: "Title" });
    make("ELLIPSE", page1, { name: "Dot", opacity: 0.5 });
    return env;
  }
  const names = async (selector: string, scope = "figma.currentPage") => {
    const { figma } = scene();
    return value(
      await run(`return ${scope}.query(${JSON.stringify(selector)}).map(n => n.name);`, figma),
    );
  };

  it("matches types, attributes and dot paths, in document order", async () => {
    expect(await names("TEXT")).toEqual(["Title", "Body", "Title"]);
    expect(await names("frame[name^=Card]")).toEqual(["Card A", "Card B"]);
    expect(await names("[name*=ar]")).toEqual(["Card A", "Card B"]);
    expect(await names("[name$=B]")).toEqual(["Card B"]);
    expect(await names("TEXT[visible=false]")).toEqual(["Body"]);
    expect(await names("[opacity=0.5]")).toEqual(["Dot"]);
    expect(await names('[name="Card A"]')).toEqual(["Card A"]);
    expect(await names("[fills.*.type=SOLID]")).toHaveLength(8);
    expect(await names("TEXT, ELLIPSE")).toEqual(["Title", "Body", "Title", "Dot"]);
  });

  it("follows combinators and pseudo-classes", async () => {
    expect(await names("FRAME[name^=Card] > TEXT")).toEqual(["Title", "Body"]);
    expect(await names("FRAME[name='Card B'] TEXT")).toEqual(["Title"]);
    expect(await names("TEXT + RECTANGLE")).toEqual(["Divider"]);
    expect(await names("TEXT ~ TEXT")).toEqual(["Body"]);
    expect(await names("TEXT:first-child")).toEqual(["Title", "Title"]);
    expect(await names("FRAME > *:last-child")).toEqual(["Body", "Row", "Title"]);
    expect(await names("FRAME[name='Card A'] > :nth-child(odd)")).toEqual(["Title", "Body"]);
    expect(await names("FRAME:not([name=Row])")).toEqual(["Card A", "Card B"]);
    expect(await names(":is(ELLIPSE, RECTANGLE)")).toEqual(["Divider", "Dot"]);
  });

  it("searches only below the node it is called on, which can still match as an ancestor", async () => {
    const { figma, page1 } = scene();
    const cardB = page1.children[1].id;
    const v = value(
      await run(
        `const b = await figma.getNodeByIdAsync("${cardB}");
         return [b.query("TEXT").map(n => n.name), b.query("FRAME TEXT").length, b.query("FRAME").map(n => n.name)];`,
        figma,
      ),
    );
    expect(v).toEqual([["Title"], 1, ["Row"]]);
  });

  it("finds a node by id, bare or with #", async () => {
    const { figma, page1 } = scene();
    const id = page1.children[2].id;
    const v = value(
      await run(
        `return [figma.currentPage.query("#${id}").length, figma.currentPage.query("${id}").first().name];`,
        figma,
      ),
    );
    expect(v).toEqual([1, "Dot"]);
  });

  it("returns a QueryResult like the remote one: no index access, plain-array map, chainable set", async () => {
    const { figma } = scene();
    const v = value(
      await run(
        `const q = figma.currentPage.query("TEXT");
         q.filter(n => n.name === "Title").set({ name: "Heading" });
         const out = [];
         for (const n of q) out.push(n.name);
         return {
           len: q.length, idx: q[0] === undefined, isArray: Array.isArray(q.map(n => n)),
           first: q.first().name, last: q.last().name, names: out,
           values: q.values(["name", "visible"]),
           sub: figma.currentPage.query("FRAME[name^=Card]").query("TEXT").length,
           json: JSON.parse(JSON.stringify(figma.currentPage.query("ELLIPSE"))).length,
         };`,
        figma,
      ),
    );
    expect(v).toEqual({
      len: 3,
      idx: true,
      isArray: true,
      first: "Heading",
      last: "Heading",
      names: ["Heading", "Body", "Heading"],
      values: [
        { name: "Heading", visible: true },
        { name: "Body", visible: false },
        { name: "Heading", visible: true },
      ],
      sub: 3,
      json: 1,
    });
  });

  it("answers matches() against the whole ancestry", async () => {
    const { figma, page1 } = scene();
    const title = page1.children[1].children[0].children[0].id;
    const v = value(
      await run(
        `const t = await figma.getNodeByIdAsync("${title}");
         return [t.matches("TEXT"), t.matches("FRAME[name='Card B'] TEXT"), t.matches("PAGE > TEXT"), t.matches("RECTANGLE")];`,
        figma,
      ),
    );
    expect(v).toEqual([true, true, false, false]);
  });

  it("rejects a broken selector with what and where", async () => {
    const { figma } = scene();
    const out = await run("return figma.currentPage.query('FRAME[name=');", figma);
    expect(out.error).toBe('query: expected ] at 11 in "FRAME[name="');
  });
});

describe("remote use_figma helpers: screenshot, tree, io, placeholder, findPlacement", () => {
  it("screenshots at 0.5x capped to 1024 px, or at an explicit scale, and returns captioned images", async () => {
    const { figma, page1, make, exports } = fakePage();
    make("FRAME", page1, { name: "Wide", width: 4000, height: 100, x: 10, y: 60 });
    make("FRAME", page1, { name: "Small", width: 300, height: 150 });
    const out = await run(
      `const [wide, small] = figma.currentPage.children;
       await wide.screenshot(); await small.screenshot(); await small.screenshot({ scale: 2, contentsOnly: false });
       return "ok";`,
      figma,
    );
    expect(exports.map((e) => [e.constraint.value, e.contentsOnly])).toEqual([
      [0.256, true],
      [0.5, true],
      [2, false],
    ]);
    expect(out.images.map((i: any) => i.name)).toEqual([
      "Wide (4000x100 at 10,60).png",
      "Small (300x150 at 0,0).png",
      "Small (300x150 at 0,0).png",
    ]);
    expect(out.images[0].data).toBe(btoa("\x89PNG"));
  });

  it(`stops at ${USE_FIGMA_MAX_IMAGES} images per call and says so`, async () => {
    const { figma } = fakePage();
    const out = await run(
      `const f = figma.createFrame(); for (let i = 0; i < ${USE_FIGMA_MAX_IMAGES + 2}; i++) await f.screenshot(); return 1;`,
      figma,
    );
    expect(out.images).toHaveLength(USE_FIGMA_MAX_IMAGES);
    expect(out.notes).toHaveLength(2);
  });

  it("prints tree() like the remote runtime", async () => {
    const { figma, page1, make } = fakePage();
    const col = make("FRAME", page1, { name: "Col", layoutMode: "VERTICAL" });
    make("RECTANGLE", col, { name: "R" });
    make("TEXT", col, { name: "" });
    const v = value(
      await run(
        `const c = figma.currentPage.children[0];
         return [c.tree(), c.tree({ fields: ["name", "layoutMode", "fills.0.type"] }), c.tree({ maxDepth: 0 })];`,
        figma,
      ),
    );
    const [plain, withFields, shallow] = v;
    const [colId, rId, tId] = [col.id, col.children[0].id, col.children[1].id];
    expect(plain).toBe(`FRAME ${colId}\n  RECTANGLE ${rId}\n  TEXT ${tId}`);
    expect(withFields).toBe(
      `FRAME ${colId} {name="Col" layoutMode=VERTICAL fills.0.type=SOLID}\n` +
        `  RECTANGLE ${rId} {name="R" fills.0.type=SOLID}\n` +
        `  TEXT ${tId} {fills.0.type=SOLID}`,
    );
    expect(shallow).toBe(`FRAME ${colId}\n  … 2 children`);
  });

  it("returns io.write text as a file and images as images", async () => {
    const { figma } = fakePage();
    const out = await run(
      `figma.io.write("note.txt", "hello"); figma.io.write("pic.png", new Uint8Array([1, 2])); return 1;`,
      figma,
    );
    expect(out.files).toEqual([{ path: "note.txt", text: "hello" }]);
    expect(out.images).toEqual([
      { name: "pic.png", mimeType: "image/png", data: btoa("\x01\x02") },
    ]);
  });

  it("keeps placeholder as a flag that defaults to false", async () => {
    const { figma } = fakePage();
    const v = value(
      await run(
        `const f = figma.createFrame(); const before = f.placeholder; f.placeholder = true; return [before, f.placeholder];`,
        figma,
      ),
    );
    expect(v).toEqual([false, true]);
  });

  it("places new content to the right of the page's content, on the current page only", async () => {
    const { figma, page1, page2, make } = fakePage();
    make("FRAME", page1, { x: 0, y: 20, width: 100, height: 50 });
    make("FRAME", page1, { x: 200, y: -10, width: 300, height: 50 });
    const v = value(
      await run(
        `const here = figma.currentPage.findPlacement({ width: 10, height: 10 });
         let other = null;
         try { (await figma.getNodeByIdAsync("${page2.id}")).findPlacement({ width: 1, height: 1 }); } catch (e) { other = e.message; }
         return [here, other];`,
        figma,
      ),
    );
    expect(v).toEqual([
      { x: 540, y: -10, width: 10, height: 10 },
      "findPlacement is only callable on the current page",
    ]);
  });
});

describe("use_figma response with helper output", () => {
  it("puts files and notes after the result and each image after its caption", () => {
    const res = useFigmaContent('"ok"', {
      files: [{ path: "a.txt", text: "hi" }],
      notes: ["dropped one"],
      images: [{ name: "Card (1x1 at 0,0).png", mimeType: "image/png", data: "AAAA" }],
    });
    expect(res.content).toEqual([
      { type: "text", text: '"ok"\n\n--- a.txt ---\nhi\n\nNote: dropped one' },
      { type: "text", text: "Card (1x1 at 0,0).png" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ]);
  });

  it("explains a helper missing on an unmet node type", () => {
    expect(withHint("t.set is not a function")).toContain("plain Plugin API");
    expect(withHint("figma.createAutoLayout is not a function")).toContain("plain Plugin API");
    expect(withHint("x.foo is not a function")).not.toContain("plain Plugin API");
  });

  it("only treats code that calls a node helper as needing the type probe", () => {
    expect(NODE_HELPER_PATTERN.test("node.set({ name: 'x' })")).toBe(true);
    expect(NODE_HELPER_PATTERN.test("await f.screenshot()")).toBe(true);
    expect(NODE_HELPER_PATTERN.test("f.placeholder = true")).toBe(true);
    expect(NODE_HELPER_PATTERN.test("const settings = 1; node.name = 'set'")).toBe(false);
  });
});
