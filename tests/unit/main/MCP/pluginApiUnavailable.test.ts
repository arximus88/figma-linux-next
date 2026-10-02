import { describe, expect, it } from "bun:test";
import { DESIGN_CONTEXT_SCRIPT, FILE_INFO_SCRIPT } from "Main/MCP/scripts";
import { PLUGIN_API_UNAVAILABLE } from "Main/MCP/scripts/helpers";

interface Page {
  editingFile?: { can_edit: boolean } | null;
  visibility?: "visible" | "hidden";
  pathname?: string;
}

/** Evaluate the renderer-side expression against a stubbed page. */
function messageFor(page: Page): string {
  const window = {
    INITIAL_OPTIONS: page.editingFile === undefined ? {} : { editing_file: page.editingFile },
  };
  const document = { visibilityState: page.visibility ?? "visible" };
  const location = { pathname: page.pathname ?? "/design/abc" };
  return new Function("window", "document", "location", `return ${PLUGIN_API_UNAVAILABLE};`)(
    window,
    document,
    location,
  );
}

// Issue #67: every case below used to collapse into one generic
// "ensure a file is open and fully loaded".
describe("window.figma missing: the error names the reason", () => {
  it("a non-file page says so and shows the path", () => {
    const msg = messageFor({ editingFile: null, pathname: "/files/recents" });
    expect(msg.startsWith("Figma Plugin API not available — ")).toBe(true);
    expect(msg).toContain("not a Figma file (/files/recents)");
  });

  it("a view-only file is called out — Figma never exposes the API there", () => {
    expect(messageFor({ editingFile: { can_edit: false } })).toContain("view-only");
  });

  it("an editable file in a background tab asks to switch to it", () => {
    const msg = messageFor({ editingFile: { can_edit: true }, visibility: "hidden" });
    expect(msg).toContain("background");
  });

  it("an editable, visible file points at loading and plugin permissions", () => {
    const msg = messageFor({ editingFile: { can_edit: true } });
    expect(msg).toContain("plugins are allowed");
    expect(msg).not.toContain("view-only");
  });

  it("a page that throws while being inspected still yields a message", () => {
    const msg = new Function("window", "document", "location", `return ${PLUGIN_API_UNAVAILABLE};`)(
      {
        get INITIAL_OPTIONS() {
          throw new Error("boom");
        },
      },
      {},
      {},
    );
    expect(msg.startsWith("Figma Plugin API not available — ")).toBe(true);
  });
});

describe("the scripts use it", () => {
  const scripts: Record<string, string> = {
    DESIGN_CONTEXT_SCRIPT: DESIGN_CONTEXT_SCRIPT(null, 1),
    FILE_INFO_SCRIPT,
  };
  for (const [name, src] of Object.entries(scripts)) {
    it(`${name} carries the reasoned message, not the old generic one`, () => {
      expect(src).toContain(PLUGIN_API_UNAVAILABLE);
      expect(src).not.toContain("ensure a file is open and fully loaded");
    });
  }
});
