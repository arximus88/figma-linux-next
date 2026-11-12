/**
 * get_motion_context (issue #89). The fake nodes carry what a live file
 * returned on 2026-11-13: float32 noise, a bezier on every easing, preset
 * names as translation keys.
 */

import { describe, expect, test } from "bun:test";
import { MOTION_CONTEXT_SCRIPT } from "Main/MCP/scripts/motion";

const run = (figma: any, nodeId: string | null, recursive = false) =>
  new Function("window", `return (${MOTION_CONTEXT_SCRIPT(nodeId, recursive)});`)({ figma });

const EASE_OUT = {
  type: "EASE_OUT",
  easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 0.5799999833106995, y2: 1 },
};

function scene() {
  const star = {
    id: "1:11",
    name: "Icon / Star",
    type: "FRAME",
    manualKeyframeTracks: {
      OPACITY: {
        id: "KeyframeTrackId:3:12",
        baseValue: { type: "FLOAT", value: 1 },
        keyframes: [
          { id: "3:13", easing: EASE_OUT, value: { type: "FLOAT", value: 0 }, timelinePosition: 0 },
          {
            id: "3:14",
            easing: EASE_OUT,
            value: { type: "FLOAT", value: 1 },
            timelinePosition: 0.6000000238418579,
          },
        ],
      },
      ROTATION: {
        baseValue: { type: "FLOAT", value: 0 },
        keyframes: [
          { easing: EASE_OUT, value: { type: "FLOAT", value: 0 }, timelinePosition: 0 },
          {
            easing: {
              type: "CUSTOM_SPRING",
              easingFunctionSpring: { mass: 1, stiffness: 100, damping: 15 },
            },
            value: { type: "FLOAT", value: -360.00001001791264 },
            timelinePosition: 1.2,
          },
        ],
      },
      fills: {
        0: {
          COLOR: {
            keyframes: [
              { value: { type: "COLOR", value: { r: 1, g: 0, b: 0, a: 1 } }, timelinePosition: 0 },
              {
                easing: { type: "HOLD" },
                value: { type: "COLOR", value: { r: 0, g: 1, b: 0, a: 1 } },
                timelinePosition: 1,
              },
            ],
          },
        },
      },
    },
    animationStyles: [] as any[],
  };
  const button = {
    id: "1:17",
    name: "Button",
    type: "INSTANCE",
    manualKeyframeTracks: {},
    animationStyles: [
      {
        type: "FIGMA",
        id: "AnimationPresetId:3:19",
        styleId: "CodeComponentId:3:18",
        name: "motion.preset_name.position",
        duration: 0.4000000059604645,
        timelineOffset: 0.2,
        props: { type: "slide_in", direction: "bottom", distance: 40, easing: EASE_OUT },
      },
      {
        type: "CUSTOM",
        id: "AnimationPresetId:3:20",
        styleId: "S:custom",
        name: "S:custom",
        duration: 1,
        timelineOffset: 0,
        props: {},
      },
    ],
  };
  const still = {
    id: "1:9",
    name: "Hero",
    type: "RECTANGLE",
    manualKeyframeTracks: {},
    animationStyles: [] as any[],
  };
  const card = {
    id: "1:8",
    name: "Card",
    type: "FRAME",
    manualKeyframeTracks: {},
    animationStyles: [] as any[],
    timelines: [{ id: "1:8", duration: 2 }],
    children: [still, star, button],
  };
  const nodes: Record<string, any> = {
    "1:8": card,
    "1:11": star,
    "0:1": { id: "0:1", type: "PAGE" },
  };
  const figma: any = {
    currentPage: { selection: [] },
    getNodeByIdAsync: async (id: string) => nodes[id] ?? null,
    motion: {
      figmaAnimationStyles: () => [
        { type: "FIGMA", styleId: "Position", name: "motion.preset_name.position" },
      ],
    },
    getLocalCustomAnimationStylesAsync: async () => [
      { id: "S:custom", name: "Brand / Pop", description: "Entrance for cards" },
    ],
  };
  return { figma, card, star };
}

describe("get_motion_context", () => {
  test("keyframes come back in seconds with CSS easings and without float noise", async () => {
    const out = await run(scene().figma, "1:11");
    const [node] = out.nodes;
    expect([node.id, node.name]).toEqual(["1:11", "Icon / Star"]);
    expect(node.keyframes.OPACITY).toEqual({
      css: "opacity, 0-1",
      restingValue: 1,
      keyframes: [
        { time: 0, value: 0 },
        { time: 0.6, value: 1, easing: "cubic-bezier(0, 0, 0.58, 1)" },
      ],
    });
    // The first keyframe has nothing to ease from: no easing written.
    expect(node.keyframes.ROTATION.keyframes[0]).toEqual({ time: 0, value: 0 });
    expect(node.keyframes.ROTATION.keyframes[1]).toEqual({
      time: 1.2,
      value: -360,
      easing: "spring(mass 1, stiffness 100, damping 15)",
    });
    expect(node.keyframes.ROTATION.css).toContain("negate");
  });

  test("fill, stroke and effect tracks are found under their index", async () => {
    const out = await run(scene().figma, "1:11");
    const colour = out.nodes[0].keyframes.fills["0.COLOR"];
    expect(colour.keyframes[1]).toEqual({
      time: 1,
      value: { r: 0, g: 1, b: 0, a: 1 },
      easing: "hold (keep the previous value, then jump)",
    });
  });

  test("only the layer itself by default, with a pointer to recursive", async () => {
    const out = await run(scene().figma, "1:8");
    expect(out.nodes).toEqual([]);
    expect(out.timelines).toEqual([{ frameId: "1:8", duration: 2 }]);
    expect(out.notes[0]).toContain("recursive: true");
    expect(out.notes[0]).toContain("3 direct children");
  });

  test("recursive lists every animated descendant and skips still layers", async () => {
    const out = await run(scene().figma, "1:8", true);
    expect(out.nodes.map((n: any) => n.id)).toEqual(["1:11", "1:17"]);
    expect(out.layersRead).toBe(4);
  });

  test("animation styles are named as the preset or the file's custom style", async () => {
    const out = await run(scene().figma, "1:8", true);
    const [preset, custom] = out.nodes[1].animationStyles;
    expect(preset).toEqual({
      kind: "Figma preset",
      name: "Position",
      startsAt: 0.2,
      duration: 0.4,
      props: {
        type: "slide_in",
        direction: "bottom",
        distance: 40,
        easing: "cubic-bezier(0, 0, 0.58, 1)",
      },
    });
    expect([custom.kind, custom.name, custom.description]).toEqual([
      "custom style",
      "Brand / Pop",
      "Entrance for cards",
    ]);
    expect(out.notes.join(" ")).toContain("does not expose the keyframes they generate");
  });

  test("uses the selection when no node is named, and says when there is none", async () => {
    const { figma, star } = scene();
    expect((await run(figma, null)).error).toContain("No nodes selected");
    figma.currentPage.selection = [star];
    expect((await run(figma, null)).nodes[0].id).toBe("1:11");
  });

  test("a page, a missing node and an account without motion each get their own error", async () => {
    const { figma, star } = scene();
    expect((await run(figma, "0:1")).error).toContain("needs a layer, not a page");
    expect((await run(figma, "9:9")).error).toContain("Node not found: 9:9");
    Object.defineProperty(star, "manualKeyframeTracks", {
      get() {
        throw new Error('"manualKeyframeTracks" is not a supported API');
      },
    });
    expect((await run(figma, "1:11")).error).toContain("motion API is not enabled");
  });
});
