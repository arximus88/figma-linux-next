/**
 * The Figma AI tier and the library tools run in the page against Figma's own
 * modules. These tests give the scripts a fake page bundler shaped like the
 * one read out of Figma's bundle (modules found by the strings in their
 * source, exports by method name) and check what the tools hand back.
 */

import { describe, expect, it } from "bun:test";

import { formatAgentExchange } from "Main/MCP/handlers/ToolHandlers";
import { FIGMA_AGENT_PROMPT_SCRIPT } from "Main/MCP/scripts/figmaAgent";
import { FIGMA_AI_GENERATE_IMAGE_SCRIPT } from "Main/MCP/scripts/figmaAi";
import { LIST_LIBRARIES_SCRIPT } from "Main/MCP/scripts/libraries";

/** A bundler whose modules are `{source, exports}`; `req(id)` returns the exports. */
function bundler(modules: Record<string, { source: string; exports: Record<string, unknown> }>) {
  const req: any = (id: string) => modules[id].exports;
  req.m = Object.fromEntries(
    Object.entries(modules).map(([id, m]) => [id, { toString: () => m.source }]),
  );
  return { push: (chunk: any[]) => chunk[2](req) };
}

const run = (script: string, window: Record<string, unknown>): Promise<any> =>
  new Function("window", "location", "crypto", `return (${script});`)(
    window,
    { pathname: "/design/FILE/x" },
    { randomUUID: () => "client-1" },
  );

/** Bun's expect has toMatchObject; its type definitions here do not. */
const matches = (actual: unknown, subset: unknown) => (expect(actual) as any).toMatchObject(subset);

const msg = (role: string, parts: [string, unknown][], clientId?: string) => ({
  role,
  clientId,
  parts: parts.map(([partType, content]) => ({ partType, contentJson: JSON.stringify(content) })),
});

describe("figma_agent_prompt", () => {
  function agentPage(outcome: unknown, opts: { never?: boolean } = {}) {
    const sent: any[] = [];
    const sendNew = (data: any) => {
      sent.push(["new", data]);
      data.onThreadResolved("thread-9");
      return opts.never ? new Promise(() => {}) : Promise.resolve(outcome);
    };
    // The source text is what the script recognises the two functions by.
    sendNew.toString = () => "function(e){return x({...e,forceCreateNewThread:!0},t)}";
    const sendTo = (data: any, id: string) => {
      sent.push(["to", data, id]);
      return Promise.resolve(outcome);
    };
    sendTo.toString = () => 'function(e,t){return x({...e,targetThreadId:t},"canvas")}';
    const messages = [
      msg("user", [["text", { text: "Make a card" }]], "client-1"),
      msg("assistant", [
        [
          "tool-call-json-DO-NOT-USE-IN-PROD",
          {
            toolCallId: "c1",
            toolName: "mcp__plugin_figma_internal__evaluate_script",
            argsJson: JSON.stringify({ taskLabel: "Create card", code: "figma.createFrame()" }),
          },
        ],
      ]),
      msg("tool", [
        [
          "tool-result-json-DO-NOT-USE-IN-PROD",
          {
            toolCallId: "c1",
            resultJson: JSON.stringify({
              success: true,
              _meta: { nodeChangeSummary: { created: ["5:1"], modified: [], deleted: [] } },
            }),
          },
        ],
      ]),
      msg("assistant", [
        ["text", { text: 'Created <figma-node-link node-id="5:1">Card</figma-node-link>.' }],
      ]),
      msg("assistant", [["assistant-prompt-lifecycle", { state: "success" }]]),
    ];
    let creditTries = 0;
    const window: any = {
      figma: { fileKey: "FILE" },
      rspackChunk_figma_web_bundler: bundler({
        "1": {
          source: "AssistantMessageProcessor not active",
          exports: { nI: sendNew, p4: sendTo },
        },
        "2": {
          source: "getThreadMessages(e){}",
          exports: {
            NH: {
              getThreadMessages: async () => ({ data: { meta: { messages } } }),
              updateThreadTitle: async () => ({}),
            },
          },
        },
        "3": {
          source: "getPlanUserActionCreditUsage(e){}",
          exports: {
            A: {
              // Like figma.com: no usage logged for the first moments.
              getPlanUserActionCreditUsage: async () => {
                if (++creditTries < 2) throw new Error("404");
                return { data: { meta: { total_credit_usage: 6 } } };
              },
            },
          },
        },
      }),
    };
    return { window, sent };
  }

  it("sends through the panel's own function and reads back answer, tools, changes and credits", async () => {
    const { window, sent } = agentPage({ exchangeOutcome: "completed" });
    const out = await run(
      FIGMA_AGENT_PROMPT_SCRIPT({
        prompt: "Make a card",
        threadId: null,
        selectedNodeIds: ["1:2"],
        title: null,
        timeoutMs: 5000,
      }),
      window,
    );
    expect(sent[0][0]).toBe("new");
    expect(sent[0][1].userInput).toEqual({
      plainText: "Make a card",
      errors: [],
      hidden: false,
      selectedNodeIds: ["1:2"],
      associatedNodeIds: ["1:2"],
    });
    matches(out, {
      threadId: "thread-9",
      outcome: "completed",
      credits: 6,
      answer: "Created Card (5:1).",
      toolCalls: [
        { tool: "evaluate_script", label: "Create card", code: "figma.createFrame()", ok: true },
      ],
      changed: { created: ["5:1"], modified: [], deleted: [] },
    });
  });

  it("continues a thread when given its id", async () => {
    const { window, sent } = agentPage({ exchangeOutcome: "completed" });
    await run(
      FIGMA_AGENT_PROMPT_SCRIPT({
        prompt: "More",
        threadId: "thread-9",
        selectedNodeIds: [],
        title: null,
        timeoutMs: 5000,
      }),
      window,
    );
    expect(sent[0][0]).toBe("to");
    expect(sent[0][2]).toBe("thread-9");
  });

  it("returns the thread id when the agent is still working at the timeout", async () => {
    const { window } = agentPage(null, { never: true });
    const out = await run(
      FIGMA_AGENT_PROMPT_SCRIPT({
        prompt: "Long",
        threadId: null,
        selectedNodeIds: [],
        title: null,
        timeoutMs: 20,
      }),
      window,
    );
    matches(out, { threadId: "thread-9", outcome: "still running" });
  });

  it("names the missing piece when Figma moved its processor", async () => {
    const out = await run(
      FIGMA_AGENT_PROMPT_SCRIPT({
        prompt: "x",
        threadId: null,
        selectedNodeIds: [],
        title: null,
        timeoutMs: 20,
      }),
      {
        rspackChunk_figma_web_bundler: bundler({
          "2": {
            source: "getThreadMessages(e){}",
            exports: { NH: { getThreadMessages: async () => ({}) } },
          },
        }),
      },
    );
    expect(out.error).toContain("message processor was not found");
  });

  it("formats an exchange as short text", () => {
    expect(
      formatAgentExchange({
        threadId: "t",
        outcome: "completed",
        ms: 12_400,
        credits: 6,
        answer: "Done.",
        toolCalls: [{ tool: "evaluate_script", label: "Make", ok: true }],
        changed: { created: ["5:1"], modified: [], deleted: [] },
      }),
    ).toBe(
      'thread t · completed · 12 s · 6 credits\nAnswer:\nDone.\nTool calls (1):\n- evaluate_script "Make" · ok\nChanged nodes: created 1: 5:1',
    );
  });
});

describe("figma_ai_generate_image", () => {
  it("asks for one image, places it and reports the credits it cost", async () => {
    const calls: any[] = [];
    let balance = 100;
    const png = btoa("\x89PNG fake");
    const created: any[] = [];
    const window: any = {
      store: { getState: () => ({ openFile: { plan: { id: "team::1" } } }) },
      figma: {
        currentPage: { children: [{ x: 0, width: 300 }] },
        createImage: () => ({
          hash: "h1",
          getSizeAsync: async () => ({ width: 1024, height: 768 }),
        }),
        createRectangle: () => {
          const r: any = {
            id: "9:9",
            resize(w: number, h: number) {
              this.w = w;
              this.h = h;
            },
          };
          created.push(r);
          return r;
        },
      },
      rspackChunk_figma_web_bundler: bundler({
        "1": {
          source: '"/api/cortex/design/editor_ai/images/generate"',
          exports: {
            Ay: {
              design: {
                generateImages: async (args: any, ctx: any) => {
                  calls.push([args, ctx]);
                  balance -= 2;
                  return { images: [png] };
                },
              },
            },
          },
        },
        "2": {
          source: 'ownerType:"file" trackingSessionId:',
          exports: {
            ctx: Object.assign(() => ({ fileKey: "FILE", ownerType: "file" }), {
              toString: () => 'function(){return{ownerType:"file"}}',
            }),
          },
        },
      }),
    };
    const fetch = async () => ({
      ok: true,
      json: async () => ({ meta: { monthly_summary: { available: balance } } }),
    });
    const out = await new Function(
      "window",
      "fetch",
      "crypto",
      "atob",
      "btoa",
      `return (${FIGMA_AI_GENERATE_IMAGE_SCRIPT({ prompt: "a leaf", negativePrompt: null, width: 1536, height: 1024, model: "gpt-image-2.5-sunburst", seed: 7, place: true, previewMax: 512 })});`,
    )(window, fetch, { randomUUID: () => "u1" }, atob, btoa);
    expect(calls[0][0]).toEqual({
      prompt: "a leaf",
      negativePrompt: "blurry, bad",
      cfgScale: 8,
      seed: 7,
      width: 1536,
      height: 1024,
      numImages: 1,
      modelType: "gpt-image-2.5-sunburst",
    });
    matches(calls[0][1], { fileKey: "FILE", clientLifecycleId: "u1" });
    expect(out.base64).toBe(png);
    expect(out.placed).toEqual({ nodeId: "9:9", imageHash: "h1", width: 1024, height: 768 });
    expect(created[0].x).toBe(500);
    expect([out.creditsBefore, out.creditsAfter]).toEqual([100, 98]);
  });
});

describe("list_libraries", () => {
  it("lists libraries by name, enabled ones first, without their long keys", async () => {
    const view = (name: string) => ({ _name: name });
    const views = { a: view("LibraryFileSubscriptions"), b: view("SubscribedLibrariesForFile") };
    const lg = Object.assign(
      async (v: any): Promise<any> =>
        v._name === "LibraryFileSubscriptions"
          ? {
              file: {
                libraryFileSubscriptionOverrides: [{ libraryKey: "lk-ds", isSubscribed: true }],
              },
            }
          : { file: { libraryTeamSubscriptions: [] } },
      { toString: () => "function(e,t,n){return subscribe(e,t,{settleTimeoutMs:1})}" },
    );
    const store = { getState: () => ({ openFile: { key: "FILE", name: "App", teamId: "1" } }) };
    const window: any = {
      rspackChunk_figma_web_bundler: bundler({
        "1": {
          source: "/api/design_systems/libraries_by_library_keys",
          exports: {
            Z: {
              getLibrariesV2: async () => ({
                data: {
                  meta: [
                    {
                      library_key: "lk-x".repeat(30),
                      library_name: "Icons",
                      library_file_key: "F2",
                      team_name: "T",
                      num_components: 9,
                      num_styles: 0,
                      num_variables: 0,
                      num_variable_collections: 0,
                    },
                    {
                      library_key: "lk-ds",
                      library_name: "DS",
                      library_file_key: "F1",
                      team_name: "T",
                      num_components: 58,
                      num_styles: 15,
                      num_variables: 170,
                      num_variable_collections: 5,
                    },
                  ],
                },
              }),
            },
          },
        },
        "2": { source: "globalReduxStore", exports: { globalReduxStore: store } },
        "3": { source: '"LibraryFileSubscriptions" "SubscribedLibrariesForFile"', exports: views },
        "4": { source: "settleTimeoutMs", exports: { Ek: lg } },
      }),
    };
    const { text } = await run(LIST_LIBRARIES_SCRIPT, window);
    expect(text.split("\n").slice(1)).toEqual([
      "- [on] DS · 58 components, 15 styles, 170 variables in 5 collections · T · file F1",
      "- [  ] Icons · 9 components, 0 styles, 0 variables · T · file F2",
    ]);
    expect(text).not.toContain("lk-");
  });
});
