/**
 * get_metadata, get_screenshot and search_design_system follow Figma's remote
 * MCP: pages when no node is given, a capped longer edge, batched queries in
 * order. The in-page scripts are run against a small fake Plugin API so the
 * behaviour a caller relies on is checked, not the source text.
 */

import { describe, expect, it } from "bun:test";

import { parseDesignSystemQueries } from "Main/MCP/handlers/ToolHandlers";
import {
  METADATA_XML_SCRIPT,
  SCREENSHOT_SCRIPT,
  SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT,
} from "Main/MCP/scripts";

function node(id: string, name: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, name, type, x: 0, y: 0, width: 100, height: 50, children: [], ...extra } as any;
}

function fakeDocument() {
  const button = node("1:10", "Button", "COMPONENT", { key: "btn-key", description: "Primary" });
  const card = node("2:10", "Card", "COMPONENT_SET", { key: "card-key" });
  const page1 = node("0:1", "Screens", "PAGE", {
    children: [node("1:2", "Home", "FRAME", { children: [button] })],
  });
  const page2 = node("0:2", "Library", "PAGE", { children: [card], loaded: false });
  // An instance of a library button variant, used twice: the file uses the
  // library component without containing it.
  const libSet = { type: "COMPONENT_SET", key: "lib-set-key", name: "DS Button" };
  const libVariant = { remote: true, key: "lib-variant-key", name: "Size=M", parent: libSet };
  const libInstance = () =>
    node("1:50", "DS Button", "INSTANCE", { getMainComponentAsync: async () => libVariant });
  const page1Nodes = [button, libInstance(), libInstance()];
  page1.findAllWithCriteria = ({ types }: { types: string[] }) =>
    page1Nodes.filter((n) => types.includes(n.type));
  // Like the page's figma: an unloaded page finds nothing, without an error.
  page2.findAllWithCriteria = ({ types }: { types: string[] }) =>
    page2.loaded && types.includes("COMPONENT_SET") ? [card] : [];
  page2.loadAsync = async () => {
    page2.loaded = true;
  };
  button.parent = page1.children[0];
  const all: Record<string, any> = {
    "0:1": page1,
    "0:2": page2,
    "1:2": page1.children[0],
    "1:10": button,
  };
  const figma: any = {
    root: { name: "Design system", children: [page1, page2] },
    currentPage: page1,
    getNodeByIdAsync: async (id: string) => all[id] ?? null,
    variables: {
      getLocalVariableCollectionsAsync: async () => [
        { name: "Tokens", variableIds: ["v1"], modes: [{ modeId: "m1", name: "Light" }] },
      ],
      getVariableByIdAsync: async () => ({
        id: "v1",
        key: "v1-key",
        name: "surface/primary",
        resolvedType: "COLOR",
        valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
      }),
    },
    teamLibrary: {
      getAvailableLibraryVariableCollectionsAsync: async () => [
        { key: "lib-coll", name: "Brand colors", libraryName: "Brand DS" },
        { key: "other-coll", name: "Other", libraryName: "Other DS" },
      ],
      getVariablesInLibraryCollectionAsync: async (key: string) =>
        key === "lib-coll"
          ? [{ key: "lib-v1", name: "surface/brand", resolvedType: "COLOR" }]
          : [{ key: "other-v1", name: "surface/other", resolvedType: "COLOR" }],
    },
    getLocalPaintStylesAsync: async () => [
      { id: "S:1", key: "st-key", name: "Surface/Card", description: "" },
    ],
    getLocalTextStylesAsync: async (): Promise<any[]> => [],
    getLocalEffectStylesAsync: async (): Promise<any[]> => [],
    getLocalGridStylesAsync: async (): Promise<any[]> => [],
  };
  page1.selection = [];
  Object.defineProperty(figma.currentPage, "selection", { value: [], writable: true });
  return { figma, page2, button };
}

const run = (script: string, figma: any, extra: Record<string, unknown> = {}) =>
  new Function("window", `return (${script});`)({ figma, ...extra });

/** A page bundler made of modules: each has the source text searched for and its exports. */
function modulesBundler(mods: Record<string, { source: string; exports: unknown }>) {
  const req: any = (id: string) => mods[id]?.exports ?? {};
  req.m = Object.fromEntries(
    Object.entries(mods).map(([id, m]) => [id, { toString: () => m.source }]),
  );
  req.m["0"] = function other() {};
  return { rspackChunk_figma_web_bundler: { push: (chunk: any[]) => chunk[2](req) } };
}

interface KitResults {
  components?: unknown[];
  state_groups?: unknown[];
  variables?: unknown[];
}

/**
 * The page's bundler, reduced to what the search uses: the Assets panel's
 * team-library search (/api/search/components) and its UI-kit search
 * (/api/search/community_libraries/library_assets), answering like Figma's.
 */
function fakeBundler(
  meta: unknown[],
  seen: unknown[] = [],
  kit: KitResults = {},
  extra: Record<string, { source: string; exports: unknown }> = {},
) {
  return modulesBundler({
    "2": {
      source: "postComponents( /api/search/components",
      exports: {
        $W: {
          postComponents: async (args: unknown) => {
            seen.push(args);
            return { data: { meta } };
          },
        },
      },
    },
    "5": {
      source: "getCommunityLibraryAssets /api/search/community_libraries/library_assets",
      exports: {
        Kt: {
          getCommunityLibraryAssets: async (args: unknown): Promise<any> => {
            seen.push(args);
            return {
              data: {
                meta: { results: { components: [], state_groups: [], variables: [], ...kit } },
              },
            };
          },
        },
      },
    },
    ...extra,
  });
}

/**
 * list_libraries' sources (libraries.ts): Simple Design System enabled in the
 * file through the team's default kits, Material 3 turned off for this file.
 */
function libraryListModules() {
  const view = (name: string) => ({ _name: name });
  const lg = Object.assign(
    async (v: any): Promise<any> =>
      v._name === "LibraryFileSubscriptions"
        ? {
            file: {
              libraryFileSubscriptionOverrides: [{ libraryKey: "lk-m3", isSubscribed: false }],
            },
          }
        : {
            file: {
              libraryTeamSubscriptions: [
                {
                  communityLibrary: {
                    name: "Simple Design System",
                    hubFile: { libraryKey: "lk-sds" },
                  },
                },
                {
                  communityLibrary: {
                    name: "Material 3 Design Kit",
                    hubFile: { libraryKey: "lk-m3" },
                  },
                },
              ],
            },
          },
    { toString: () => "function(e,t,n){return subscribe(e,t,{settleTimeoutMs:1})}" },
  );
  return {
    "11": {
      source: "/api/design_systems/libraries_by_library_keys",
      exports: { Z: { getLibrariesV2: async (): Promise<any> => ({ data: { meta: [] } }) } },
    },
    "12": {
      source: "globalReduxStore",
      exports: {
        globalReduxStore: {
          getState: () => ({ openFile: { key: "file-key", name: "App", teamId: "1" } }),
        },
      },
    },
    "13": {
      source: '"LibraryFileSubscriptions" "SubscribedLibrariesForFile"',
      exports: { a: view("LibraryFileSubscriptions"), b: view("SubscribedLibrariesForFile") },
    },
    "14": { source: "settleTimeoutMs", exports: { Ek: lg } },
  };
}

/** UI-kit search answers shaped like Figma's, trimmed to the fields used. */
const KIT_HITS: KitResults = {
  state_groups: [
    { name: "Button", key: "m3-button", library_key: "lk-m3", description: "M3 button" },
    {
      name: "Button",
      key: "sds-button",
      library_key: "lk-sds",
      containing_frame: { pageName: "Buttons" },
    },
  ],
  components: [
    { name: "X", component_key: "sds-x", library_key: "lk-sds" },
    {
      name: "Variant=Primary",
      component_key: "sds-variant",
      state_group_id: "77",
      library_key: "lk-sds",
    },
  ],
  variables: [
    {
      name: "Background/Default/Default",
      key: "sds-bg",
      variable_type: "COLOR",
      library_key: "lk-sds",
    },
    { name: "Background/Surface", key: "m3-bg", variable_type: "COLOR", library_key: "lk-m3" },
  ],
};

const LIBRARY_HITS = [
  {
    name: "Button",
    type: "state_group",
    key: "ds-button",
    file_name: "mdx-ds",
    library_key: "lk-mdx",
    description: "Primary action.\n\nMin height 44px.",
    containing_frame: { pageName: "Buttons" },
  },
  {
    name: "IconButton",
    type: "component",
    key: "ds-icon",
    file_name: "Blade",
    library_key: "lk-blade",
    description: "",
  },
  {
    name: "DS Button",
    type: "state_group",
    key: "lib-set-key",
    file_name: "mdx-ds",
    library_key: "lk-mdx",
  },
];

describe("get_metadata", () => {
  it("lists the pages when no node is given, the current one marked", async () => {
    const { figma } = fakeDocument();
    const { xml } = JSON.parse(await run(METADATA_XML_SCRIPT(null, 8), figma));
    expect(xml).toContain('<document name="Design system">');
    expect(xml).toContain('<page id="0:1" name="Screens" current="true"/>');
    expect(xml).toContain('<page id="0:2" name="Library"/>');
    expect(xml).not.toContain("Home");
    expect(xml).not.toContain("Currently selected");
  });

  it("starts with the selection when there is one", async () => {
    const { figma, button } = fakeDocument();
    figma.currentPage.selection = [button];
    const { xml } = JSON.parse(await run(METADATA_XML_SCRIPT(null, 8), figma));
    expect(xml.startsWith("Currently selected nodes:\n- 1:10 Button (COMPONENT)\n\n")).toBe(true);
  });

  it("loads a page that was never opened before outlining it", async () => {
    const { figma, page2 } = fakeDocument();
    const { xml } = JSON.parse(await run(METADATA_XML_SCRIPT("0:2", 8), figma));
    expect(page2.loaded).toBe(true);
    expect(xml).toContain('<canvas id="0:2" name="Library"');
    expect(xml).toContain('name="Card"');
  });

  it("outlines a node, and points to the page list for an unknown id", async () => {
    const { figma } = fakeDocument();
    const { xml } = JSON.parse(await run(METADATA_XML_SCRIPT("1:2", 8), figma));
    expect(xml).toContain('name="Home"');
    expect(xml).toContain('name="Button"');
    const missing = JSON.parse(await run(METADATA_XML_SCRIPT("9:9", 8), figma));
    expect(missing.error).toContain("without nodeId to list the pages");
  });
});

describe("get_screenshot sizing", () => {
  const exportWith = (w: number, h: number) => {
    const seen: any[] = [];
    const target = {
      id: "1:2",
      name: "Frame",
      type: "FRAME",
      width: w,
      height: h,
      exportAsync: async (settings: any) => {
        seen.push(settings);
        return new Uint8Array([137, 80, 78, 71]);
      },
    };
    const figma = { getNodeByIdAsync: async () => target, currentPage: { selection: [] as any[] } };
    return { figma, seen };
  };

  it("caps the longer edge at 1024 by default, as Figma's remote tool does", async () => {
    const { figma, seen } = exportWith(4000, 1000);
    const out = await run(
      SCREENSHOT_SCRIPT("1:2", { scale: null, maxDimension: 1024, contentsOnly: false }),
      figma,
    );
    expect(seen[0].constraint).toEqual({ type: "SCALE", value: 0.256 });
    expect(seen[0].contentsOnly).toBe(false);
    expect([out.width, out.height, out.original_width, out.original_height]).toEqual([
      1024, 256, 4000, 1000,
    ]);
  });

  it("renders a small node at 2x instead of blowing it up to the cap", async () => {
    const { figma, seen } = exportWith(100, 50);
    const out = await run(
      SCREENSHOT_SCRIPT("1:2", { scale: null, maxDimension: 1024, contentsOnly: true }),
      figma,
    );
    expect(seen[0].constraint.value).toBe(2);
    expect(seen[0].contentsOnly).toBe(true);
    expect(out.width).toBe(200);
  });

  it("lets an explicit scale win over the cap", async () => {
    const { figma, seen } = exportWith(4000, 1000);
    await run(
      SCREENSHOT_SCRIPT("1:2", { scale: 1, maxDimension: 1024, contentsOnly: false }),
      figma,
    );
    expect(seen[0].constraint.value).toBe(1);
  });
});

describe("search_design_system queries", () => {
  const search = async (
    queries: unknown[],
    libraryKeys: string[] | null = null,
    bundler: Record<string, unknown> = fakeBundler([]),
  ) => {
    const { figma } = fakeDocument();
    figma.fileKey = "file-key";
    return run(
      SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT(JSON.stringify(queries), JSON.stringify(libraryKeys)),
      figma,
      bundler,
    );
  };

  it("adds Figma's ranked search over all libraries after the file's own components, once each", async () => {
    const seen: any[] = [];
    const out = await search(
      [{ entity: "component", query: "button" }],
      null,
      fakeBundler(LIBRARY_HITS, seen),
    );
    expect(seen).toEqual([
      { query: "button", openFileKey: "file-key", fv: 0 },
      { query: "button" },
    ]);
    const hits = out.results[0].results;
    expect(hits.map((c: any) => [c.source, c.name, c.key])).toEqual([
      ["local", "Button", "btn-key"],
      ["library (used in this file)", "DS Button", "lib-set-key"],
      ["library", "Button", "ds-button"],
      ["library", "IconButton", "ds-icon"],
    ]);
    expect(hits[2]).toEqual({
      source: "library",
      library: "mdx-ds",
      name: "Button",
      type: "COMPONENT_SET",
      key: "ds-button",
      description: "Primary action. Min height 44px.",
      page: "Buttons",
    });
    expect(hits[3].description).toBeUndefined();
  });

  it("keeps only the libraries asked for, by name or key", async () => {
    const out = await search(
      [{ entity: "component", query: "button" }],
      ["lk-blade"],
      fakeBundler(LIBRARY_HITS),
    );
    expect(out.results[0].results.map((c: any) => c.key)).toEqual(["ds-icon"]);
  });

  it("falls back to the file and says so when Figma's search module is gone", async () => {
    const out = await search([{ entity: "component", query: "ds button" }], null, fakeBundler([]));
    expect(out.results[0].results.map((c: any) => c.key)).toEqual(["lib-set-key"]);
    const gone = await search([{ entity: "component", query: "ds button" }], null, {
      rspackChunk_figma_web_bundler: {
        push: (chunk: any[]) => chunk[2](Object.assign(() => ({}), { m: {} })),
      },
    });
    expect(gone.results[0].results.map((c: any) => c.key)).toEqual(["lib-set-key"]);
    expect(gone.notes.join(" ")).toContain("library search was not found");
  });

  it("answers each query in order, with the keys a follow-up call needs", async () => {
    const out = await search([
      { entity: "component", query: "button" },
      { entity: "style", query: "surface" },
      { entity: "variable", query: "surface" },
    ]);
    expect(out.results.map((r: any) => r.entity)).toEqual(["component", "style", "variable"]);
    const components = out.results[0].results;
    expect(components.map((c: any) => [c.source, c.name])).toEqual([
      ["local", "Button"],
      ["library (used in this file)", "DS Button"],
    ]);
    const button = components[0];
    expect([button.name, button.key, button.id, button.page]).toEqual([
      "Button",
      "btn-key",
      "1:10",
      "Screens",
    ]);
    const style = out.results[1].results[0];
    expect([style.name, style.key]).toEqual(["Surface/Card", "st-key"]);
    const vars = out.results[2].results;
    expect(vars.map((v: any) => [v.source, v.name])).toEqual([
      ["local", "surface/primary"],
      ["library", "surface/brand"],
      ["library", "surface/other"],
    ]);
    expect([vars[1].library, vars[1].key]).toEqual(["Brand DS", "lib-v1"]);
  });

  it("finds library components the file uses through its instances, once each", async () => {
    const out = await search([{ entity: "component", query: "ds button" }]);
    const hits = out.results[0].results;
    expect(hits).toHaveLength(1);
    expect([hits[0].source, hits[0].key, hits[0].type, hits[0].variantKey]).toEqual([
      "library (used in this file)",
      "lib-set-key",
      "COMPONENT_SET",
      "lib-variant-key",
    ]);
  });

  it("finds UI kit components and variables, named from the library list, enabled libraries first", async () => {
    const out = await search(
      [
        { entity: "component", query: "button" },
        { entity: "variable", query: "background" },
      ],
      null,
      fakeBundler(LIBRARY_HITS, [], KIT_HITS, libraryListModules()),
    );
    const components = out.results[0].results.map((c: any) => [c.source, c.library ?? null, c.key]);
    expect(components).toEqual([
      ["local", null, "btn-key"],
      ["library (used in this file)", null, "lib-set-key"],
      // Simple Design System is on in this file, so its hits lead the library ones.
      ["library", "Simple Design System", "sds-button"],
      ["library", "Simple Design System", "sds-x"],
      ["library", "mdx-ds", "ds-button"],
      ["library", "Blade", "ds-icon"],
      ["library", "Material 3 Design Kit", "m3-button"],
    ]);
    expect(out.results[0].results[2].page).toBe("Buttons");
    expect(out.results[1].results).toEqual([
      {
        source: "library",
        library: "Simple Design System",
        key: "sds-bg",
        name: "Background/Default/Default",
        type: "COLOR",
      },
      {
        source: "library",
        library: "Material 3 Design Kit",
        key: "m3-bg",
        name: "Background/Surface",
        type: "COLOR",
      },
    ]);
    expect(out.notes).toBeUndefined();
  });

  it("takes a library name in includeLibraryKeys for UI kits too, which carry only a key", async () => {
    const out = await search(
      [
        { entity: "component", query: "button" },
        { entity: "variable", query: "background" },
      ],
      ["Simple Design System"],
      fakeBundler(LIBRARY_HITS, [], KIT_HITS, libraryListModules()),
    );
    expect(out.results[0].results.map((c: any) => c.key)).toEqual(["sds-button", "sds-x"]);
    expect(out.results[1].results.map((v: any) => v.key)).toEqual(["sds-bg"]);
  });

  it("still searches the kits, unnamed, when the library list cannot be read", async () => {
    const out = await search(
      [{ entity: "variable", query: "background" }],
      null,
      fakeBundler([], [], KIT_HITS),
    );
    expect(out.results[0].results.map((v: any) => [v.library, v.key])).toEqual([
      ["UI kit", "sds-bg"],
      ["UI kit", "m3-bg"],
    ]);
  });

  it("restricts variables to the given libraries", async () => {
    const out = await search([{ entity: "variable", query: "surface" }], ["Brand DS"]);
    expect(out.results[0].results.map((v: any) => v.name)).toEqual(["surface/brand"]);
  });

  it("loads pages that were never opened before searching them", async () => {
    const out = await search([{ entity: "component", query: "card" }]);
    expect(out.results[0].results.map((c: any) => [c.name, c.page])).toEqual([["Card", "Library"]]);
    expect(out.notes).toBeUndefined();
  });

  it("names the pages it could not load instead of reporting them empty", async () => {
    const { figma, page2 } = fakeDocument();
    page2.loadAsync = () => Promise.reject(new Error("offline"));
    const out = await run(
      SEARCH_DESIGN_SYSTEM_QUERIES_SCRIPT(
        JSON.stringify([{ entity: "component", query: "card" }]),
        "null",
      ),
      figma,
      fakeBundler([]),
    );
    expect(out.results[0].total).toBe(0);
    expect(out.notes.join(" ")).toContain(
      "Not searched for components (did not load in time): Library",
    );
  });
});

describe("search_design_system argument check", () => {
  it("accepts the remote shape", () => {
    expect(parseDesignSystemQueries([{ entity: "variable", query: " surface " }])).toEqual([
      { entity: "variable", query: "surface" },
    ]);
  });

  it("explains the shape when an agent passes strings or a wrong entity", () => {
    expect(parseDesignSystemQueries(["button"])).toContain(
      '{"entity":"component","query":"button"}',
    );
    expect(parseDesignSystemQueries([{ entity: "components", query: "x" }])).toContain(
      "entity must be",
    );
    expect(parseDesignSystemQueries([])).toContain("array of objects");
  });
});
