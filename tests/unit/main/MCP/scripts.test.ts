import { describe, expect, it } from "bun:test";
import {
  CREATE_PAGE_SCRIPT,
  SEARCH_DESIGN_SYSTEM_SCRIPT,
  USE_FIGMA_SCRIPT,
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
