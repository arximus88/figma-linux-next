import { describe, expect, it } from "bun:test";
import { DESIGN_CONTEXT_SCRIPT, FILE_INFO_SCRIPT } from "Main/MCP/scripts";
import { PLUGIN_API_STATE, PLUGIN_API_UNAVAILABLE } from "Main/MCP/scripts/helpers";

interface EditingFile {
  can_edit?: boolean;
  can_export?: boolean;
  can_access_full_dev_mode?: boolean;
  editor_type?: string;
  team_id?: string | null;
  parent_org_id?: string | null;
}

interface Page {
  editingFile?: EditingFile | null;
  visibility?: "visible" | "hidden";
  pathname?: string;
  search?: string;
  figma?: object;
}

/** An editable design file in a team: what a normal Figma file looks like. */
const TEAM_FILE: EditingFile = {
  can_edit: true,
  can_export: true,
  can_access_full_dev_mode: true,
  editor_type: "design",
  team_id: "123",
  parent_org_id: null,
};

/** Evaluate a renderer-side expression against a stubbed page. */
function evalOn(expression: string, page: Page): string {
  const window = {
    figma: page.figma,
    INITIAL_OPTIONS: page.editingFile === undefined ? {} : { editing_file: page.editingFile },
  };
  const document = { visibilityState: page.visibility ?? "visible" };
  const location = { pathname: page.pathname ?? "/design/abc", search: page.search ?? "" };
  return new Function("window", "document", "location", `return ${expression};`)(
    window,
    document,
    location,
  );
}

const messageFor = (page: Page) => evalOn(PLUGIN_API_UNAVAILABLE, page);
const stateFor = (page: Page) => evalOn(PLUGIN_API_STATE, page);

// Issue #67: every case below used to collapse into one generic
// "ensure a file is open and fully loaded".
describe("window.figma missing: the error names the reason", () => {
  it("a non-file page says so and shows the path", () => {
    const msg = messageFor({ editingFile: null, pathname: "/files/recents" });
    expect(msg.startsWith("Figma Plugin API not available — ")).toBe(true);
    expect(msg).toContain("not a Figma file (/files/recents)");
  });

  it("view access (a Dev seat, a file shared as can view) points at the remote server", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, can_edit: false } });
    expect(msg).toContain("you can only view this file");
    expect(msg).toContain("remote MCP server");
  });

  // Pukimaa on #67: Full and Dev seats fail too. early.js blocks the API for
  // can_edit === false before Dev Mode is even considered.
  it("view access stays the reason in Dev Mode too", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, can_edit: false }, search: "?m=dev" });
    expect(msg).toContain("you can only view this file");
  });

  it("Dev Mode without full Dev Mode access says so", () => {
    const msg = messageFor({
      editingFile: { ...TEAM_FILE, can_access_full_dev_mode: false },
      search: "?node-id=1-2&m=dev",
    });
    expect(msg).toContain("no full Dev Mode access");
  });

  it("Dev Mode in a file with export restricted says so", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, can_export: false }, search: "?m=dev" });
    expect(msg).toContain("exporting is restricted");
  });

  it("export restrictions do not matter in the design editor", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, can_export: false } });
    expect(msg).not.toContain("exporting is restricted");
  });

  it("a Sites file is called out", () => {
    expect(messageFor({ editingFile: { ...TEAM_FILE, editor_type: "sites" } })).toContain("Sites");
  });

  it("a file in no team or org is called out", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, team_id: null } });
    expect(msg).toContain("no team or organization");
  });

  it("an org file needs no team", () => {
    const msg = messageFor({ editingFile: { ...TEAM_FILE, team_id: null, parent_org_id: "9" } });
    expect(msg).not.toContain("no team or organization");
  });

  it("an editable file in a background tab asks to switch to it", () => {
    const msg = messageFor({ editingFile: TEAM_FILE, visibility: "hidden" });
    expect(msg).toContain("background");
  });

  it("an editable, visible file points at loading and plugin permissions", () => {
    const msg = messageFor({ editingFile: TEAM_FILE });
    expect(msg).toContain("plugins are allowed");
    expect(msg).not.toContain("only view");
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

describe("PLUGIN_API_STATE: whether waiting can help", () => {
  it("ready once window.figma is there", () => {
    expect(stateFor({ editingFile: { ...TEAM_FILE, can_edit: false }, figma: {} })).toBe("ready");
  });

  it("pending while an editable file loads or sits in the background", () => {
    expect(stateFor({ editingFile: TEAM_FILE })).toBe("pending");
    expect(stateFor({ editingFile: TEAM_FILE, visibility: "hidden" })).toBe("pending");
  });

  it("blocked where Figma will never install it", () => {
    expect(stateFor({ editingFile: null, pathname: "/files/recents" })).toBe("blocked");
    expect(stateFor({ editingFile: { ...TEAM_FILE, can_edit: false } })).toBe("blocked");
    expect(
      stateFor({
        editingFile: { ...TEAM_FILE, can_access_full_dev_mode: false },
        search: "?m=dev",
      }),
    ).toBe("blocked");
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
