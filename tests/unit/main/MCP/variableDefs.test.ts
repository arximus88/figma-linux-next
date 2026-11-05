/**
 * get_variable_defs answers with values an agent can use: aliases followed to
 * the colour, the mode the layer renders in, the token an alias points at.
 * Run against a small fake Plugin API.
 */

import { describe, expect, it } from "bun:test";

import { METADATA_XML_SCRIPT, VARIABLE_DEFS_SCRIPT } from "Main/MCP/scripts";

const run = (script: string, figma: any) =>
  new Function("window", `return (${script});`)({ figma });

const alias = (id: string) => ({ type: "VARIABLE_ALIAS", id });

function tokens() {
  const collections: Record<string, any> = {
    semantic: {
      id: "semantic",
      name: "semantic-tokens",
      defaultModeId: "light",
      modes: [
        { modeId: "light", name: "Light" },
        { modeId: "dark", name: "Dark" },
      ],
      variableIds: ["V:bg"],
    },
    palette: {
      id: "palette",
      name: "palette",
      defaultModeId: "p",
      modes: [{ modeId: "p", name: "Value" }],
      variableIds: ["V:gray50", "V:gray950"],
    },
  };
  const variables: Record<string, any> = {
    "V:bg": {
      id: "V:bg",
      name: "color/bg",
      variableCollectionId: "semantic",
      codeSyntax: { WEB: "var(--ds-color-bg)" },
      valuesByMode: { light: alias("V:gray50"), dark: alias("V:gray950") },
    },
    "V:gray50": {
      id: "V:gray50",
      name: "gray/50",
      variableCollectionId: "palette",
      codeSyntax: {},
      valuesByMode: { p: { r: 0.96, g: 0.97, b: 0.98, a: 1 } },
    },
    "V:gray950": {
      id: "V:gray950",
      name: "gray/950",
      variableCollectionId: "palette",
      codeSyntax: {},
      valuesByMode: { p: { r: 0.05, g: 0.07, b: 0.08, a: 1 } },
    },
  };
  return { collections, variables };
}

function fakeFigma(nodes: Record<string, any>) {
  const { collections, variables } = tokens();
  return {
    root: { name: "App" },
    currentPage: { selection: [] as any[] },
    getNodeByIdAsync: async (id: string) => nodes[id] ?? null,
    getStyleByIdAsync: async (id: string) =>
      id === "S:h"
        ? {
            name: "Heading/XL",
            fontName: { family: "Inter", style: "Bold" },
            fontSize: 22,
            lineHeight: { unit: "PIXELS", value: 29 },
            letterSpacing: { unit: "PERCENT", value: -1 },
            description: "",
          }
        : null,
    getLocalTextStylesAsync: async (): Promise<any[]> => [],
    variables: {
      getVariableByIdAsync: async (id: string) => variables[id] ?? null,
      getVariableCollectionByIdAsync: async (id: string) => collections[id] ?? null,
      getLocalVariableCollectionsAsync: async () => [collections.semantic, collections.palette],
    },
  };
}

describe("get_variable_defs", () => {
  it("gives the colour a layer renders with, in its mode, and the token behind the alias", async () => {
    const frame = {
      id: "1:1",
      name: "Card",
      type: "FRAME",
      boundVariables: { fills: [alias("V:bg")] },
      resolvedVariableModes: { semantic: "dark" },
      children: [
        { id: "1:2", name: "Title", type: "TEXT", textStyleId: "S:h", children: [] as any[] },
      ],
    };
    const { text } = await run(VARIABLE_DEFS_SCRIPT("1:1"), fakeFigma({ "1:1": frame }));
    expect(text).toContain('Used by 1:1 "Card" and its layers:');
    expect(text).toContain("- color/bg: #0d1214 · ← gray/950 · var(--ds-color-bg) · mode Dark");
    expect(text).toContain("- Heading/XL (text): Inter Bold, 22px/29px, letter-spacing -1%");
    expect(text).not.toContain("VariableID");
  });

  it("lists every local variable with each mode resolved when nothing is selected", async () => {
    const { text } = await run(VARIABLE_DEFS_SCRIPT(null), fakeFigma({}));
    expect(text).toContain("Collection semantic-tokens (modes Light, Dark):");
    expect(text).toContain(
      "- color/bg: Light #f5f7fa ← gray/50; Dark #0d1214 ← gray/950 · var(--ds-color-bg)",
    );
    expect(text).toContain("- gray/50: #f5f7fa");
  });

  it("says so when a layer binds nothing", async () => {
    const plain = { id: "2:1", name: "Box", type: "RECTANGLE" };
    const { text } = await run(VARIABLE_DEFS_SCRIPT("2:1"), fakeFigma({ "2:1": plain }));
    expect(text).toBe('No variables or styles are bound in 2:1 "Box" or its layers.');
  });
});

describe("get_metadata outline", () => {
  it("shows an instance as one element and repeats text only when it differs from the name", async () => {
    const inner = {
      id: "I3:1;1:1",
      name: "Label",
      type: "TEXT",
      characters: "Buy",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    };
    const frame = {
      id: "3:0",
      name: "Row",
      type: "FRAME",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      children: [
        {
          id: "3:1",
          name: "Button",
          type: "INSTANCE",
          x: 0,
          y: 0,
          width: 50,
          height: 40,
          children: [inner],
        },
        {
          id: "3:2",
          name: "Price",
          type: "TEXT",
          characters: "500 ₴",
          x: 60,
          y: 0,
          width: 40,
          height: 20,
        },
        {
          id: "3:3",
          name: "Note",
          type: "TEXT",
          characters: "Note",
          x: 60,
          y: 20,
          width: 40,
          height: 20,
        },
      ],
    };
    const figma = {
      root: { name: "App" },
      currentPage: { name: "P", selection: [] as any[] },
      getNodeByIdAsync: async () => frame,
    };
    const { xml } = JSON.parse(await run(METADATA_XML_SCRIPT("3:0", 8), figma));
    expect(xml).toContain('<instance id="3:1" name="Button" x="0" y="0" width="50" height="40"/>');
    expect(xml).not.toContain("I3:1;1:1");
    expect(xml).toContain('name="Price" x="60" y="0" width="40" height="20" text="500 ₴"/>');
    expect(xml).toContain('<text id="3:3" name="Note" x="60" y="20" width="40" height="20"/>');
  });
});
