import { describe, expect, it } from "bun:test";
import {
  CREATE_PAGE_SCRIPT,
  DESIGN_CONTEXT_SCRIPT,
  FIGJAM_SCRIPT,
  FIND_NODES_SCRIPT,
  METADATA_XML_SCRIPT,
  SCREENSHOT_SCRIPT,
  SEARCH_DESIGN_SYSTEM_SCRIPT,
  SET_TEXT_SCRIPT,
  TREE_SCRIPT,
  USE_FIGMA_SCRIPT,
  VARIABLE_DEFS_SCRIPT,
} from "Main/MCP/scripts";

// A value that breaks a naive `"${x}"` interpolation: embedded double-quote,
// backslash, and a newline — each of which would terminate/corrupt a raw string
// literal injected into the executeJavaScript source.
const NASTY = 'Button "primary" \\ end\nnext';

/**
 * Compiling the script body via `new Function` parses it WITHOUT executing —
 * an unescaped interpolation that breaks a string literal raises SyntaxError
 * here, so this is a precise guard for the quote-safety of the builders.
 */
function assertParses(src: string) {
  expect(() => new Function(src)).not.toThrow();
}

describe("MCP script builders — injection / quote safety", () => {
  it("SEARCH_DESIGN_SYSTEM_SCRIPT safely embeds an arbitrary query", () => {
    const src = SEARCH_DESIGN_SYSTEM_SCRIPT(NASTY);
    assertParses(src);
    // The value must be embedded via JSON.stringify, not a raw literal.
    expect(src).toContain(JSON.stringify(NASTY));
    expect(src).not.toContain(`"${NASTY}"`);
  });

  it("USE_FIGMA_SCRIPT safely embeds an arbitrary action", () => {
    const src = USE_FIGMA_SCRIPT(NASTY, "{}");
    assertParses(src);
    expect(src).toContain(JSON.stringify(NASTY));
  });

  it("CREATE_PAGE_SCRIPT safely embeds an arbitrary page name", () => {
    const src = CREATE_PAGE_SCRIPT(NASTY);
    assertParses(src);
    expect(src).toContain(JSON.stringify(NASTY));
  });

  it("plain inputs still produce parseable scripts", () => {
    assertParses(SEARCH_DESIGN_SYSTEM_SCRIPT("color"));
    assertParses(USE_FIGMA_SCRIPT("create_frame", '{"name":"x"}'));
    assertParses(CREATE_PAGE_SCRIPT("My Page"));
  });
});

describe("MCP node-id script builders — injection safety", () => {
  // Every builder interpolates the nodeId into figma.getNodeById(...); a crafted
  // id with a quote must not break out of the string literal.
  const builders: Array<[string, (id: string) => string]> = [
    ["DESIGN_CONTEXT_SCRIPT", (id) => DESIGN_CONTEXT_SCRIPT(id, 2)],
    ["METADATA_XML_SCRIPT", (id) => METADATA_XML_SCRIPT(id, 2)],
    ["VARIABLE_DEFS_SCRIPT", (id) => VARIABLE_DEFS_SCRIPT(id)],
    ["FIGJAM_SCRIPT", (id) => FIGJAM_SCRIPT(id)],
    ["SCREENSHOT_SCRIPT", (id) => SCREENSHOT_SCRIPT(id, 2)],
    ["FIND_NODES_SCRIPT", (id) => FIND_NODES_SCRIPT(id, "{}")],
    ["TREE_SCRIPT", (id) => TREE_SCRIPT(id, 5)],
    ["SET_TEXT_SCRIPT", (id) => SET_TEXT_SCRIPT(id, JSON.stringify("hi"))],
  ];

  const EVIL_ID = '1:2"); figma.root.remove(); ("';

  for (const [name, build] of builders) {
    it(`${name} safely embeds a crafted nodeId`, () => {
      const src = build(EVIL_ID);
      assertParses(src);
      expect(src).toContain(JSON.stringify(EVIL_ID));
      expect(src).not.toContain(`getNodeById("${EVIL_ID}")`);
    });
  }
});
