/**
 * get_design_context as React + Tailwind (issue #89): the markup parser, the
 * CSS → Tailwind mapping, the JSX writer and the tool's choice of form.
 *
 * The markup below is what the page script wrote for a real scene on
 * 2026-11-13 (a card with a variable-bound background, an image fill, an icon,
 * a text style, mixed text runs, two instances and an absolute badge).
 */

import { describe, expect, test } from "bun:test";
import {
  designContextFormat,
  ToolHandlers,
  type ToolContext,
} from "Main/MCP/handlers/ToolHandlers";
import { DESIGN_ASSETS_SCRIPT } from "Main/MCP/scripts/assets";
import { isElement, type MarkupElement, parseMarkup } from "Main/MCP/utils/markup";
import { buildReactCode, pascalCase } from "Main/MCP/utils/reactCode";
import { splitTopLevel, tailwindFor } from "Main/MCP/utils/tailwind";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const MARKUP = `<frame id="1:8" name="Lesson / Overview {card}" style="width:360px;height:359px;display:flex;flex-direction:column;gap:var(--space-md, 16px);padding:24px 24px 32px;overflow:hidden;background:var(--color-bg, #0b0b0c);border-radius:16px;border:1px solid #ffffff1f;box-shadow:0px 8px 24px #00000066">
  <rectangle id="1:9" name="Hero image" style="align-self:stretch;height:120px;background:image(fill ${HASH});border-radius:12px"/>
  <frame id="1:10" name="Title row" style="display:flex;align-items:center;gap:12px;overflow:hidden">
    <svg id="1:11" name="Icon / Star" style="width:24px;height:24px;color:#ffcc33"/>
    <text id="1:13" text-style="Heading/L" style="color:#ffffff">Lesson &lt;1&gt; &amp; more</text>
  </frame>
  <text id="1:14" name="Learn &quot;auto&quot; layout" style="align-self:stretch"><span style="font-family:'Inter';font-size:14px">Learn auto layout.<br/></span><span style="font-family:'Inter';font-weight:700;font-size:14px">Bold part</span><span style="font-family:'Inter';font-size:14px"> here.</span></text>
  <frame id="1:16" name="Actions" style="display:flex;gap:8px">
    <instance id="1:17" name="Button" component="Button" variant="Size=Large" style="display:flex;padding:10px 20px;background:#3366ff;border-radius:8px">
      <text id="I1:17;1:7" style="font-family:'Inter';font-weight:600;font-size:14px;color:#ffffff">Continue</text>
    </instance>
    <frame id="1:30" name="Deep" children="3 more: call again on this id"/>
  </frame>
  <!-- 1:99: layer threw */ oddly -->
  <ellipse id="1:21" name="Badge" style="position:absolute;left:336px;top:12px;width:12px;height:12px;fill:#ff334d;stroke:#ffffff;stroke-width:2px"/>
  <star id="1:22" name="Lone star" style="width:20px;height:20px;fill:#ffcc33"/>
</frame>
`;

const build = (extra: Partial<Parameters<typeof buildReactCode>[0]> = {}) =>
  buildReactCode({
    nodes: parseMarkup(MARKUP),
    textStyleCss: {
      "Heading/L": "font-family:'Inter';font-weight:700;font-size:28px;line-height:34px",
    },
    svgUrls: { "1:11": "http://127.0.0.1:3845/assets/star.svg" },
    imageUrls: { [HASH]: "http://127.0.0.1:3845/assets/hero.png" },
    ...extra,
  });

describe("parseMarkup", () => {
  const [root] = parseMarkup(MARKUP) as MarkupElement[];

  test("reads elements, unescaped attributes and nesting", () => {
    expect(root.tag).toBe("frame");
    expect(root.attrs.name).toBe("Lesson / Overview {card}");
    const elements = root.children.filter(isElement);
    expect(elements.map((el) => el.attrs.id)).toEqual([
      "1:9",
      "1:10",
      "1:14",
      "1:16",
      "1:21",
      "1:22",
    ]);
    expect(elements[2].attrs.name).toBe('Learn "auto" layout');
  });

  test("keeps text only inside text layers, unescaped, with line breaks as elements", () => {
    const title = (root.children[1] as MarkupElement).children[1] as MarkupElement;
    expect(title.children).toEqual([{ text: "Lesson <1> & more" }]);
    // Indentation between layers is layout, not content.
    expect(root.children.some((child) => "text" in child)).toBe(false);
    const firstRun = (root.children.filter(isElement)[2].children[0] as MarkupElement).children;
    expect(firstRun[0]).toEqual({ text: "Learn auto layout." });
    expect((firstRun[1] as MarkupElement).tag).toBe("br");
  });

  test("a layer that threw survives as a comment", () => {
    expect(root.children.some((c) => "comment" in c && c.comment.startsWith("1:99"))).toBe(true);
  });
});

describe("tailwindFor", () => {
  const classes = (style: string) => tailwindFor(style).classes.join(" ");

  test("layout, spacing and box declarations", () => {
    expect(classes("display:flex;flex-direction:column;justify-content:space-between")).toBe(
      "flex flex-col justify-between",
    );
    expect(classes("padding:24px")).toBe("p-[24px]");
    expect(classes("padding:10px 20px")).toBe("py-[10px] px-[20px]");
    expect(classes("padding:24px 24px 32px")).toBe("pt-[24px] px-[24px] pb-[32px]");
    expect(classes("padding:1px 2px 3px 4px")).toBe("pt-[1px] pr-[2px] pb-[3px] pl-[4px]");
    expect(classes("flex:1 0 0;align-self:stretch")).toBe("flex-[1_0_0] self-stretch");
    expect(classes("border-radius:4px 4px 0px 0px")).toBe("rounded-[4px_4px_0px_0px]");
    expect(classes("box-shadow:0px 8px 24px #00000066, inset 0px 1px 0px #fff")).toBe(
      "shadow-[0px_8px_24px_#00000066,inset_0px_1px_0px_#fff]",
    );
  });

  test("a variable keeps its fallback and stays one padding value", () => {
    expect(classes("gap:var(--space-md, 16px)")).toBe("gap-[var(--space-md,16px)]");
    expect(classes("padding:var(--space-md, 16px) 8px")).toBe("py-[var(--space-md,16px)] px-[8px]");
    expect(splitTopLevel("var(--a, 4px) 8px", " ")).toEqual(["var(--a, 4px)", "8px"]);
  });

  test("a variable gets a type hint where colour and size share a prefix", () => {
    expect(classes("color:var(--text, #fff)")).toBe("text-[color:var(--text,#fff)]");
    expect(classes("font-size:var(--size, 14px)")).toBe("text-[length:var(--size,14px)]");
    expect(classes("color:#ffffff;font-size:14px")).toBe("text-[#ffffff] text-[14px]");
    expect(classes("border:var(--w, 2px) dashed var(--line, #000)")).toBe(
      "border-[length:var(--w,2px)] border-dashed border-[color:var(--line,#000)]",
    );
  });

  test("fonts, borders and effects", () => {
    expect(classes("font-family:'Open Sans';font-weight:600;font-style:italic")).toBe(
      "font-['Open_Sans'] font-semibold italic",
    );
    expect(classes("border:1px solid #ffffff1f")).toBe("border border-solid border-[#ffffff1f]");
    expect(classes("outline:2px solid #000")).toBe("outline-[2px] outline-solid outline-[#000]");
    expect(classes("filter:blur(4px);backdrop-filter:blur(8px);transform:rotate(-45deg)")).toBe(
      "blur-[4px] backdrop-blur-[8px] rotate-[-45deg]",
    );
    expect(classes("background:linear-gradient(#3366ff 0%, #9933ff 100%)")).toBe(
      "bg-[linear-gradient(#3366ff_0%,#9933ff_100%)]",
    );
  });

  test("nothing is dropped: layered backgrounds go inline, unknown properties stay arbitrary", () => {
    const layered = tailwindFor("background:linear-gradient(#000 0%, #fff 100%), #ff0000");
    expect(layered.classes).toEqual([]);
    expect(layered.inline.background).toContain("linear-gradient");
    expect(classes("writing-mode:vertical-rl")).toBe("[writing-mode:vertical-rl]");
  });
});

describe("buildReactCode", () => {
  const { code, missingAssets } = build();

  test("the result is a component that compiles", () => {
    expect(code).toContain("export default function LessonOverviewCard() {");
    const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(code);
    expect(js).toContain("LessonOverviewCard");
  });

  test("assets are constants on top, used by the image fill and the icon", () => {
    expect(code).toContain('const imgHeroImage = "http://127.0.0.1:3845/assets/hero.png";');
    expect(code).toContain('const imgIconStar = "http://127.0.0.1:3845/assets/star.svg";');
    expect(code).toContain("style={{ backgroundImage: `url($" + "{imgHeroImage})` }}");
    expect(code).toContain('<img alt="" src={imgIconStar} className="w-[24px] h-[24px]"');
    // The SVG file has its own colours.
    expect(code).not.toContain("ffcc33]");
  });

  test("every layer keeps its id and name, instances their component", () => {
    expect(code).toContain('data-node-id="1:8" data-name={"Lesson / Overview {card}"}');
    expect(code).toContain('data-name="Button" data-component="Button" data-variant="Size=Large"');
    expect(code).toContain('data-node-id="I1:17;1:7"');
    expect(code).toContain(`data-name={"Learn \\"auto\\" layout"}`);
  });

  test("a text style is written out as classes, text is escaped for JSX", () => {
    expect(code).toContain(
      `<p className="font-['Inter'] font-bold text-[28px] leading-[34px] text-[#ffffff]" data-node-id="1:13">{"Lesson <1> & more"}</p>`,
    );
    expect(code).toContain('{" here."}');
  });

  // Rendered in a browser on 2026-11-13: with the font only on the runs, the
  // paragraph kept its default line-height and the lines sat too far apart.
  test("what every run of a mixed text shares moves to the paragraph", () => {
    expect(code).toContain(
      `<p className="self-stretch font-['Inter'] text-[14px]" data-node-id="1:14" data-name={"Learn \\"auto\\" layout"}>` +
        `Learn auto layout.<br /><span className="font-bold">Bold part</span>{" here."}</p>`,
    );
  });

  test("an absolute child gets a positioned parent; an ellipse becomes a round box", () => {
    expect(code).toContain('<div className="relative w-[360px]');
    expect(code).toContain(
      'className="absolute left-[336px] top-[12px] w-[12px] h-[12px] bg-[#ff334d] border-[2px] border-solid border-[#ffffff] rounded-[9999px]"',
    );
  });

  test("what could not be linked or written out is said, not invented", () => {
    // The lone star has no URL: a sized placeholder, counted.
    expect(code).toContain('<div className="w-[20px] h-[20px]" data-node-id="1:22"');
    expect(missingAssets).toBe(1);
    expect(code).toContain("{/* 3 more layer(s): call get_design_context on 1:30 */}");
    expect(code).toContain("{/* 1:99: layer threw * / oddly */}");
    expect(build({ imageUrls: {} }).missingAssets).toBe(2);
  });

  test("a layer mapped with add_code_connect_map is written as that component", () => {
    const codeConnect = new Map([
      ["1:17", { nodeId: "1:17", codeConnectSrc: "src/ui/Button.tsx", codeConnectName: "Button" }],
    ]);
    const mapped = build({ codeConnect }).code;
    expect(mapped).toContain('import { Button } from "src/ui/Button.tsx";');
    expect(mapped).toContain('<Button data-node-id="1:17" />');
    expect(mapped).not.toContain("Continue");
    new Bun.Transpiler({ loader: "tsx" }).transformSync(mapped);
  });

  test("several selected layers share one fragment; names are always identifiers", () => {
    const two = buildReactCode({
      nodes: parseMarkup('<frame id="1:1" name="1st card"/>\n<frame id="1:2" name="B"/>\n'),
      textStyleCss: {},
      svgUrls: {},
      imageUrls: {},
    }).code;
    expect(two).toContain("export default function Component1stCard() {");
    expect(two).toContain("<>");
    new Bun.Transpiler({ loader: "tsx" }).transformSync(two);
    expect(pascalCase("—", "Component")).toBe("Component");
  });
});

describe("get_design_context picks its form", () => {
  test("format wins, then clientFrameworks; languages alone change nothing", () => {
    expect(designContextFormat({})).toBe("markup");
    expect(designContextFormat({ clientFrameworks: "react" })).toBe("react");
    expect(designContextFormat({ clientFrameworks: "Vue, Next.js" })).toBe("react");
    expect(designContextFormat({ clientFrameworks: ["remix"] })).toBe("react");
    expect(designContextFormat({ clientFrameworks: "svelte,react-native" })).toBe("markup");
    expect(designContextFormat({ clientLanguages: "typescript" })).toBe("markup");
    expect(designContextFormat({ clientFrameworks: "react", format: "markup" })).toBe("markup");
    expect(designContextFormat({ clientFrameworks: "vue", format: "react" })).toBe("react");
  });

  function handlers() {
    const scripts: string[] = [];
    const ctx: ToolContext = {
      viewProvider: {
        executeInBrowserView: async (script: string) => {
          scripts.push(script);
          if (script.includes("out.svgs[id]")) {
            return {
              svgs: { "1:11": "<svg/>" },
              images: { [HASH]: { format: "png", base64: "aGk=" } },
            };
          }
          if (script.includes("exportAsync({\n      format: 'PNG'")) {
            return { base64: "c2hvdA==", nodeId: "1:8", nodeName: "Card" };
          }
          return JSON.stringify({
            text: `<!-- file "F" -->\n${MARKUP}\nNotes:\n- markup legend\n`,
            markup: MARKUP,
            legendForCode: "Components:\n- Button",
            textStyleCss: { "Heading/L": "font-size:28px" },
            targetIds: ["1:8"],
          });
        },
        getActiveTabView: (): null => null,
        getActiveTabUrl: (): null => null,
      } as any,
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      codeConnectMap: new Map(),
      assetStore: new Map(),
      getPort: () => 3845,
      getSaveBaseDir: () => "/tmp",
      editorWaitMs: 0,
    };
    return { tool: new ToolHandlers(ctx), scripts, ctx };
  }

  test("React: one asset round trip for the layers the code refers to, screenshot appended", async () => {
    const { tool, scripts, ctx } = handlers();

    const response: any = await tool.toolGetDesignContext({
      nodeId: "1:8",
      clientFrameworks: "react",
    });

    expect(scripts[0]).toContain("const FOR_CODE = true;");
    // The icon and the lone star are asked for, and the image by its hash.
    expect(scripts[1]).toBe(DESIGN_ASSETS_SCRIPT(["1:11", "1:22"], [HASH]));
    const text = response.content[0].text as string;
    expect(text).toContain("export default function LessonOverviewCard()");
    expect(text).toContain("Components:\n- Button");
    expect(text).not.toContain("markup legend");
    expect(text).toContain("expire in 10 minutes");
    expect(ctx.assetStore.size).toBe(2);
    const url = /const imgIconStar = "http:\/\/127\.0\.0\.1:3845\/assets\/([^"]+)"/.exec(text);
    expect(ctx.assetStore.get(url![1])?.contentType).toBe("image/svg+xml");
    expect(response.content[1]).toEqual({ type: "image", data: "c2hvdA==", mimeType: "image/png" });
  });

  test("excludeScreenshot leaves the image out; markup stays text-only unless asked", async () => {
    const react = handlers();
    const noShot: any = await react.tool.toolGetDesignContext({
      nodeId: "1:8",
      format: "react",
      excludeScreenshot: true,
    });
    expect(noShot.content).toHaveLength(1);

    const markup = handlers();
    const plain: any = await markup.tool.toolGetDesignContext({ nodeId: "1:8" });
    expect(markup.scripts).toHaveLength(1);
    expect(markup.scripts[0]).toContain("const FOR_CODE = false;");
    expect(plain.content).toHaveLength(1);
    expect(plain.content[0].text).toContain("markup legend");

    const asked: any = await handlers().tool.toolGetDesignContext({
      nodeId: "1:8",
      excludeScreenshot: false,
    });
    expect(asked.content[1].type).toBe("image");
  });
});
