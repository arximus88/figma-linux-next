/**
 * use_figma `code` mode, run against a fake Plugin API: the in-page wrapper is
 * plain JS, so its contract (return channel, node serialization, atomic
 * rollback that never undoes the user's own work) can be checked without
 * Figma. The live behaviour of commitUndo/triggerUndo is checked separately in
 * the app.
 */

import { describe, expect, it } from "bun:test";

import {
  checkUseFigmaSyntax,
  USE_FIGMA_CODE_SCRIPT,
  USE_FIGMA_MAX_RESULT_CHARS,
} from "Main/MCP/scripts/useFigmaCode";

interface FakeNode {
  id: string;
  name: string;
  type: string;
  removed: boolean;
  parent: unknown;
}

/**
 * A Plugin API stand-in with the undo behaviour measured in the app on
 * 2026-11-04: commitUndo() closes the current step (a no-op when it is empty),
 * triggerUndo() reverts the open step or else the last closed one — so an
 * undo after an empty step reverts the user's previous action — and
 * shared plugin data on the root is recorded like any other change. No
 * documentchange events, as in the page.
 */
function fakeFigma() {
  type Op = () => void;
  let current: Op[] = [];
  const stack: Op[][] = [];
  const nodes: FakeNode[] = [];
  const shared = new Map<string, string>();
  let n = 0;
  const record = (undo: Op) => current.push(undo);
  const figma = {
    nodes,
    stack,
    commitUndo: () => {
      if (current.length) stack.push(current);
      current = [];
    },
    triggerUndo: () => {
      const step = current.length ? current : stack.pop();
      current = [];
      for (const undo of [...(step ?? [])].reverse()) undo();
    },
    root: {
      getSharedPluginData: (ns: string, key: string) => shared.get(`${ns}/${key}`) ?? "",
      setSharedPluginData: (ns: string, key: string, value: string) => {
        const k = `${ns}/${key}`;
        const before = shared.get(k) ?? "";
        shared.set(k, value);
        record(() => shared.set(k, before));
      },
    },
    createRectangle: (): FakeNode => {
      const node = {
        id: `1:${++n}`,
        name: "Rectangle",
        type: "RECTANGLE",
        removed: false,
        parent: {},
      };
      nodes.push(node);
      record(() => {
        node.removed = true;
        nodes.splice(nodes.indexOf(node), 1);
      });
      return node;
    },
    /** The user's own edit, already closed into its own undo step. */
    userEdit: () => {
      const node = figma.createRectangle();
      node.name = "user's work";
      figma.commitUndo();
      return node;
    },
  };
  return figma;
}

async function run(code: string, figma: unknown = fakeFigma()): Promise<any> {
  const window = { figma };
  // The script is an expression; evaluate it with `window` in scope.
  return new Function("window", `return (${USE_FIGMA_CODE_SCRIPT(code)});`)(window);
}

describe("use_figma code mode", () => {
  it("returns the value of `return`, with top-level await", async () => {
    const out = await run("const v = await Promise.resolve(41); return { answer: v + 1 };");
    expect(JSON.parse(out.result)).toEqual({ answer: 42 });
  });

  it("turns nodes into {id, name, type} and survives cycles and functions", async () => {
    const out = await run(`
      const r = figma.createRectangle();
      const loop = { r, f: () => 1 }; loop.self = loop;
      return { node: r, loop, bytes: new Uint8Array(3) };
    `);
    expect(JSON.parse(out.result)).toEqual({
      node: { id: "1:1", name: "Rectangle", type: "RECTANGLE" },
      loop: { r: { id: "1:1", name: "Rectangle", type: "RECTANGLE" }, self: "[Circular]" },
      bytes: "<Uint8Array 3>",
    });
  });

  it("returns null when the code returns nothing", async () => {
    expect((await run("figma.createRectangle();")).result).toBe("null");
  });

  it("undoes the script's changes when it throws after changing the file", async () => {
    const figma = fakeFigma();
    const mine = figma.userEdit();
    const out = await run(
      "figma.createRectangle(); figma.createRectangle(); throw new Error('boom');",
      figma,
    );
    expect(out.error).toBe("boom");
    expect(out.rolledBack).toBe(true);
    expect(figma.nodes).toEqual([mine]);
    expect(figma.root.getSharedPluginData("fln_mcp", "txn")).toBe("");
  });

  it("never undoes the user's work when the script throws before changing anything", async () => {
    // Without the marker, commitUndo + triggerUndo here would revert the user's edit.
    const figma = fakeFigma();
    const mine = figma.userEdit();
    const out = await run("throw new Error('nope');", figma);
    expect(out.error).toBe("nope");
    expect(out.rolledBack).toBe(true);
    expect(mine.removed).toBe(false);
    expect(figma.nodes).toEqual([mine]);
  });

  it("makes a successful script one undo step and leaves no marker behind", async () => {
    const figma = fakeFigma();
    const mine = figma.userEdit();
    await run("figma.createRectangle(); figma.createRectangle(); return 1;", figma);
    expect(figma.nodes).toHaveLength(3);
    expect(figma.root.getSharedPluginData("fln_mcp", "txn")).toBe("");
    // One Ctrl+Z takes back the whole script and nothing of the user's.
    figma.triggerUndo();
    expect(figma.nodes).toEqual([mine]);
  });

  it("says only part was undone when the script committed undo steps itself", async () => {
    const figma = fakeFigma();
    const out = await run(
      "figma.createRectangle(); figma.commitUndo(); figma.createRectangle(); throw new Error('late');",
      figma,
    );
    expect(out.rolledBack).toBe(false);
    expect(out.note).toContain("commitUndo");
    expect(figma.nodes).toHaveLength(1);
  });

  it("says so when undo is unavailable, instead of claiming a rollback", async () => {
    const figma: any = fakeFigma();
    figma.commitUndo = () => {
      throw new Error("not supported");
    };
    const out = await run("figma.createRectangle(); throw new Error('x');", figma);
    expect(out.rolledBack).toBe(false);
    expect(out.note).toContain("may remain");
  });

  it("caps a huge result", async () => {
    const out = await run(`return "x".repeat(${USE_FIGMA_MAX_RESULT_CHARS + 10});`);
    expect(out.truncated).toBe(true);
    expect(out.result.length).toBe(USE_FIGMA_MAX_RESULT_CHARS);
  });

  it("explains a missing Plugin API instead of throwing", async () => {
    const out = await new Function(
      "window",
      "location",
      "document",
      `return (${USE_FIGMA_CODE_SCRIPT("return 1;")});`,
    )({}, { pathname: "/files/recents", search: "" }, { visibilityState: "visible" });
    expect(out.error).toContain("Figma Plugin API not available");
  });
});

describe("use_figma syntax check", () => {
  it("accepts a body with top-level await and return", () => {
    expect(
      checkUseFigmaSyntax("const x = await figma.getNodeByIdAsync('1:2'); return x;"),
    ).toBeNull();
  });

  it("rejects broken code, including attempts to close the wrapper early", () => {
    expect(checkUseFigmaSyntax("return (1;")).toBeTruthy();
    expect(checkUseFigmaSyntax("}).call(); alert(1); (async function () {")).toBeTruthy();
  });
});
