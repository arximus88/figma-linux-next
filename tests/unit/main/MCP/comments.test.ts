/**
 * Comment tools: get_comments' filters and pages, and the four writes.
 *
 * The page scripts run here against a fake figma.com that answers like
 * /api/file/<key>/comments and records every request, so the tests see the
 * method, path, headers and body a write would send. Shapes follow Figma's
 * web bundle (2026-11-20), see scripts/comments.ts.
 */

import { describe, expect, it } from "bun:test";

import { ToolHandlers, type ToolContext } from "Main/MCP/handlers/ToolHandlers";
import {
  COMMENT_ANCHOR_SCRIPT,
  COMMENT_WRITE_SCRIPT,
  COMMENTS_LIST_SCRIPT,
} from "Main/MCP/scripts/comments";
import { mcpToolList, TOOL_ANNOTATIONS, TOOLS, WRITE_TOOLS } from "Main/MCP/tools/definitions";
import {
  buildClientMeta,
  checkCommentTarget,
  type CommentFilters,
  filterComments,
  formatComments,
  normalizeComments,
  parseCommentFilters,
} from "Main/MCP/utils/comments";

const ME = "111";

/** Bun's expect has toMatchObject; its type definitions here do not. */
const matches = (actual: unknown, subset: unknown) => (expect(actual) as any).toMatchObject(subset);

// Three threads: #10 on layer 1:2 with two replies, #12 resolved on a point,
// #20 on page 5:0 at a point inside frame 5:7. #13 was deleted.
const RAW: any[] = [
  {
    id: "10",
    parent_id: null,
    user: { id: ME, handle: "Me" },
    created_at: "2026-11-01T09:30:00Z",
    resolved_at: null,
    message: "Make the  title\nbigger",
    client_meta: {
      x: 110,
      y: 220,
      node_id: "1:2",
      node_offset: { x: 10, y: 20 },
      in_frame: true,
      page_id: "0:1",
      stable_path: ["1:2"],
    },
  },
  {
    id: "11",
    parent_id: "10",
    user: { id: "222", handle: "Anna" },
    created_at: "2026-11-02T10:00:00Z",
    message_meta: [{ t: "Done, " }, { user_annotated: { id: ME, handle: "Me" } }],
  },
  {
    id: "14",
    parent_id: "10",
    user_id: ME,
    user: { id: ME, handle: "Me" },
    created_at: "2026-11-03T10:00:00Z",
    message_meta: [{ t: "Thanks" }],
  },
  {
    id: "12",
    parent_id: null,
    user: { id: "222", handle: "Anna" },
    created_at: "2026-10-01T10:00:00Z",
    resolved_at: "2026-10-02T10:00:00Z",
    message: "Old",
    client_meta: { x: 10, y: 20, page_id: "0:1" },
  },
  {
    id: "13",
    parent_id: null,
    user: { id: "222", handle: "Anna" },
    created_at: "2026-11-05T10:00:00Z",
    deleted_at: "2026-11-05T11:00:00Z",
    message: "gone",
  },
  {
    id: "20",
    parent_id: null,
    user: { id: "333", handle: "Bob" },
    created_at: "2026-11-04T10:00:00Z",
    resolved_at: null,
    message_meta: [{ t: "Spacing? " }, { user_id: "222", t: "@Anna" }],
    client_meta: { x: 550, y: 560, page_id: "5:0" },
  },
];

const filters = (args: Record<string, unknown>): CommentFilters => {
  const parsed = parseCommentFilters(args);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.filters;
};
const ids = (args: Record<string, unknown>, ctx = {}) =>
  filterComments(normalizeComments(RAW), filters(args), ctx).page.map((c) => c.id);

describe("normalizeComments", () => {
  it("drops deleted comments and gives replies their root's thread, resolution and pin", () => {
    const all = normalizeComments(RAW);
    expect(all.map((c) => c.id)).toEqual(["10", "11", "14", "12", "20"]);
    const reply = all.find((c) => c.id === "11")!;
    matches(reply, {
      threadId: "10",
      isRoot: false,
      userId: "222",
      nodeId: "1:2",
      pageId: "0:1",
      message: "Done, @Me",
      mentionedUserIds: [ME],
    });
    expect(all.find((c) => c.id === "10")!.message).toBe("Make the title bigger");
  });
});

describe("get_comments filters", () => {
  it("lists every thread, newest first, replies under their root, when nothing is set", () => {
    expect(ids({})).toEqual(["20", "10", "11", "14", "12"]);
  });

  it("resolved: true / false / both, and includeResolved as the old name", () => {
    expect(ids({ resolved: true })).toEqual(["12"]);
    expect(ids({ resolved: false })).toEqual(["20", "10", "11", "14"]);
    expect(ids({ resolved: "both" })).toHaveLength(5);
    expect(ids({ includeResolved: false })).toEqual(["20", "10", "11", "14"]);
    expect(ids({ includeResolved: true })).toHaveLength(5);
    expect(parseCommentFilters({ resolved: "yes" })).toEqual({
      error: 'resolved must be true, false or "both"',
    });
  });

  it("threadId, pageId, userId, mentionedUserId and rootOnly", () => {
    expect(ids({ threadId: "10" })).toEqual(["10", "11", "14"]);
    expect(ids({ pageId: "5:0" })).toEqual(["20"]);
    expect(ids({ pageId: "5-0" })).toEqual(["20"]);
    expect(ids({ userId: ME })).toEqual(["10", "14"]);
    expect(ids({ mentionedUserId: "222" })).toEqual(["20"]);
    expect(ids({ mentionedUserId: ME })).toEqual(["11"]);
    expect(ids({ rootOnly: true })).toEqual(["20", "10", "12"]);
  });

  it("nodeId: threads pinned to the layer, and pins inside its bounds; open only by default", () => {
    expect(ids({ nodeId: "1-2" })).toEqual(["10", "11", "14"]);
    const frame = { id: "5:7", pageId: "5:0", box: { x: 500, y: 500, width: 100, height: 100 } };
    expect(ids({ nodeId: "5:7" }, { node: frame })).toEqual(["20"]);
    // Same bounds on another page: no match.
    expect(ids({ nodeId: "5:7" }, { node: { ...frame, pageId: "0:1" } })).toEqual([]);
    // Inside the bounds but resolved: left out unless asked for.
    const around12 = { id: "9:9", pageId: "0:1", box: { x: 0, y: 0, width: 50, height: 50 } };
    expect(ids({ nodeId: "9:9" }, { node: around12 })).toEqual([]);
    expect(ids({ nodeId: "9:9", resolved: "both" }, { node: around12 })).toEqual(["12"]);
    expect(ids({ nodeId: "9:9", includeResolved: true }, { node: around12 })).toEqual(["12"]);
  });

  it("unreadOnly keeps only comments figma.com marks unread", () => {
    const raw = [
      { id: "1", user: { id: "2" }, is_unread: true, message: "a" },
      { id: "2", user: { id: "2" }, is_unread: false, message: "b" },
    ];
    const page = filterComments(normalizeComments(raw), filters({ unreadOnly: true })).page;
    expect(page.map((c) => c.id)).toEqual(["1"]);
  });

  it("pages with limit and the cursor it hands back", () => {
    const all = normalizeComments(RAW);
    const first = filterComments(all, filters({ limit: 2 }));
    expect(first.page.map((c) => c.id)).toEqual(["20", "10"]);
    expect(first.matched).toBe(5);
    expect(first.nextCursor).not.toBeNull();
    const second = filterComments(all, filters({ limit: 2, cursor: first.nextCursor }));
    expect(second.page.map((c) => c.id)).toEqual(["11", "14"]);
    const last = filterComments(all, filters({ limit: 2, cursor: second.nextCursor }));
    expect(last.page.map((c) => c.id)).toEqual(["12"]);
    expect(last.nextCursor).toBeNull();
    expect(parseCommentFilters({ limit: 51 })).toHaveProperty("error");
    expect(parseCommentFilters({ limit: 0 })).toHaveProperty("error");
    expect(parseCommentFilters({ cursor: "abc" })).toHaveProperty("error");
  });

  it("writes one line per comment, with ids, authors and where each thread is", () => {
    const all = normalizeComments(RAW);
    const f = filters({ limit: 3 });
    const text = formatComments(filterComments(all, f), f, { "1:2": "Card" }, all.length);
    expect(text).toBe(
      "Comments 1-3 of 5 matching (open and resolved), 5 in the file:\n" +
        "#20 at (550, 560) (page 5:0) · Bob (333) · 2026-11-04 10:00: Spacing? @Anna\n" +
        '#10 on 1:2 "Card" (page 0:1) · Me (111) · 2026-11-01 09:30: Make the title bigger\n' +
        "  ↳ #11 · Anna (222) · 2026-11-02 10:00: Done, @Me\n" +
        "nextCursor: o3",
    );
    const f2 = filters({ limit: 3, cursor: "o3" });
    expect(formatComments(filterComments(all, f2), f2, {}, all.length)).toContain(
      "#14 reply in #10 · Me (111)",
    );
    expect(formatComments(filterComments([], f), f, {}, 0)).toBe("No comments on this file.");
  });
});

describe("anchoring a new thread", () => {
  it("pins to a layer as Figma's client does: offset from its bounds, in_frame, stable path", () => {
    const node = { id: "1:2", pageId: "0:1", box: { x: 100, y: 200, width: 50, height: 40 } };
    expect(buildClientMeta({ node, offset: { x: 5, y: 6 } })).toEqual({
      x: 105,
      y: 206,
      node_id: "1:2",
      node_offset: { x: 5, y: 6 },
      in_frame: true,
      page_id: "0:1",
      stable_path: ["1:2"],
    });
    expect(buildClientMeta({ node }).node_offset).toEqual({ x: 0, y: 0 });
    const inInstance = buildClientMeta({ node: { ...node, id: "I1:2;3:4" } });
    expect(inInstance.node_id).toBe("1:2");
    expect(inInstance.stable_path).toEqual(["1:2", "3:4"]);
  });

  it("pins to a canvas point with only x, y and the page", () => {
    expect(buildClientMeta({ point: { x: 1, y: 2 }, pageId: "0:1" })).toEqual({
      x: 1,
      y: 2,
      page_id: "0:1",
    });
  });
});

describe("checks before a write", () => {
  const all = normalizeComments(RAW);
  it("replies and resolves only on a thread's root", () => {
    expect(checkCommentTarget(all, "10", "reply", ME)).toHaveProperty("comment");
    expect(checkCommentTarget(all, "11", "reply", ME)).toEqual({
      error: "#11 is a reply; reply to its thread #10.",
    });
    expect(checkCommentTarget(all, "11", "resolve", ME)).toHaveProperty("error");
    expect(checkCommentTarget(all, "13", "resolve", ME)).toHaveProperty("error");
  });

  it("deletes only the signed-in user's own comments", () => {
    expect(checkCommentTarget(all, "14", "delete", ME)).toHaveProperty("comment");
    expect(checkCommentTarget(all, "11", "delete", ME)).toEqual({
      error: "#11 was written by Anna, not you; only your own comments can be deleted.",
    });
    expect(checkCommentTarget(all, "14", "delete", null)).toHaveProperty("error");
  });
});

// ── The page side ─────────────────────────────────────────────────────────

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
}

const NODES: Record<string, any> = {
  "0:1": { id: "0:1", type: "PAGE", name: "Page 1" },
  "5:0": { id: "5:0", type: "PAGE", name: "Page 2" },
};
NODES["1:2"] = {
  id: "1:2",
  type: "FRAME",
  name: "Card",
  parent: NODES["0:1"],
  absoluteBoundingBox: { x: 100, y: 200, width: 50, height: 40 },
};
NODES["5:7"] = {
  id: "5:7",
  type: "FRAME",
  name: "Panel",
  parent: NODES["5:0"],
  absoluteBoundingBox: { x: 500, y: 500, width: 100, height: 100 },
};

function fakePage(comments: unknown[] = RAW) {
  const sent: Sent[] = [];
  const window: any = {
    INITIAL_OPTIONS: { editing_file: { key: "FILEKEY" }, user_data: { id: ME } },
    figma: {
      currentPage: NODES["0:1"],
      getNodeByIdAsync: async (id: string) => NODES[id] ?? null,
    },
    crypto: { randomUUID: () => "uuid-1" },
  };
  const fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    sent.push({
      method,
      url,
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const reply = (status: number, body: unknown) => ({
      ok: status < 400,
      status,
      json: async () => body,
    });
    if (method === "GET" && url === "/api/file/FILEKEY/comments")
      return reply(200, { meta: comments });
    if (method === "POST" && url === "/api/file/FILEKEY/comments")
      return reply(200, { meta: { id: "99" } });
    if (method === "POST" && url === "/api/file/FILEKEY/comments/10")
      return reply(200, { meta: { id: "98", parent_id: "10" } });
    if ((method === "PUT" || method === "DELETE") && url.startsWith("/api/file/FILEKEY/comments/"))
      return reply(200, { meta: null });
    return reply(404, { message: "Not found" });
  };
  const location = { pathname: "/design/FILEKEY/x" };
  const run = (script: string) =>
    new Function("window", "fetch", "location", `return (${script});`)(window, fetch, location);
  return { run, sent };
}

describe("page scripts", () => {
  it("lists the file's comments with who is signed in, layer names and the nodeId's bounds", async () => {
    const { run, sent } = fakePage();
    const out = await run(COMMENTS_LIST_SCRIPT("5:7"));
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual(["GET /api/file/FILEKEY/comments"]);
    expect(out.me).toBe(ME);
    expect(out.comments).toHaveLength(RAW.length);
    expect(out.names).toEqual({ "1:2": "Card" });
    expect(out.node).toEqual({
      id: "5:7",
      name: "Panel",
      pageId: "5:0",
      box: { x: 500, y: 500, width: 100, height: 100 },
    });
  });

  it("sends a write with Figma's headers, the file key and a fresh uuid", async () => {
    const { run, sent } = fakePage();
    const out = await run(
      COMMENT_WRITE_SCRIPT({
        method: "POST",
        suffix: "",
        stamp: true,
        body: { message_meta: [{ t: "hi" }] },
      }),
    );
    expect(out).toEqual({ fileKey: "FILEKEY", meta: { id: "99" } });
    expect(sent[0]).toEqual({
      method: "POST",
      url: "/api/file/FILEKEY/comments",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Csrf-Bypass": "yes",
        "X-Figma-User-ID": ME,
      },
      body: { message_meta: [{ t: "hi" }], file_key: "FILEKEY", uuid: "uuid-1" },
    });
  });

  it("reports figma.com's refusal with its reason", async () => {
    const { run } = fakePage();
    const out = await run(COMMENT_WRITE_SCRIPT({ method: "DELETE", suffix: "/x" as `/${string}` }));
    expect(out.error).toBeUndefined();
    const bad = await run(
      COMMENT_WRITE_SCRIPT({ method: "POST", suffix: "/nope", body: { message_meta: [] } }),
    );
    expect(bad.error).toBe(
      "figma.com answered 404 for POST /api/file/FILEKEY/comments/nope: Not found",
    );
  });

  it("finds where a thread can go: a layer's page and bounds, or a checked page", async () => {
    const { run } = fakePage();
    expect((await run(COMMENT_ANCHOR_SCRIPT("1:2", null))).node.pageId).toBe("0:1");
    expect((await run(COMMENT_ANCHOR_SCRIPT("1:2", "5:0"))).error).toBe(
      "Layer 1:2 is on page 0:1, not 5:0.",
    );
    expect((await run(COMMENT_ANCHOR_SCRIPT(null, null))).pageId).toBe("0:1");
    expect((await run(COMMENT_ANCHOR_SCRIPT(null, "1:2"))).error).toBe(
      "1:2 is not a page of this file.",
    );
    expect((await run(COMMENT_ANCHOR_SCRIPT("0:1", null))).error).toContain("is a page");
    expect((await run(COMMENT_ANCHOR_SCRIPT("8:8", null))).error).toBe(
      "No layer 8:8 in this file.",
    );
  });
});

// ── The tools, end to end against the fake page ──────────────────────────

function tools(comments: unknown[] = RAW) {
  const page = fakePage(comments);
  const ctx: ToolContext = {
    viewProvider: {
      executeInBrowserView: (script: string) => page.run(script),
      getActiveTabView: (): null => null,
    } as any,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    codeConnectMap: new Map(),
    assetStore: new Map(),
    getPort: () => 3845,
    getSaveBaseDir: () => "/tmp",
  };
  return { h: new ToolHandlers(ctx), sent: page.sent };
}
const text = (r: any) => r.content[0].text as string;
const writes = (sent: Sent[]) => sent.filter((s) => s.method !== "GET");

describe("comment tools", () => {
  it("get_comments applies the filters to what figma.com answers", async () => {
    const { h } = tools();
    const r = await h.toolGetComments({ nodeId: "5:7" });
    expect(text(r)).toBe(
      "Comments 1-1 of 1 matching (on layer 5:7, open), 5 in the file:\n" +
        "#20 at (550, 560) (page 5:0) · Bob (333) · 2026-11-04 10:00: Spacing? @Anna",
    );
  });

  it("get_comments refuses unreadOnly when figma.com gives no read state", async () => {
    const { h } = tools();
    const r: any = await h.toolGetComments({ unreadOnly: true });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("carries no read state");
  });

  it("post_comment on a layer sends the client's body with the pin at the offset", async () => {
    const { h, sent } = tools();
    const r = await h.toolPostComment({
      message: "Looks off",
      nodeId: "1-2",
      offset: { x: 4, y: 3 },
    });
    expect(JSON.parse(text(r))).toEqual({
      threadId: "99",
      pinnedTo: { nodeId: "1:2", name: "Card", pageId: "0:1" },
    });
    expect(writes(sent)).toHaveLength(1);
    expect(writes(sent)[0].body).toEqual({
      message_meta: [{ t: "Looks off" }],
      attachments: [],
      client_meta: {
        x: 104,
        y: 203,
        node_id: "1:2",
        node_offset: { x: 4, y: 3 },
        in_frame: true,
        page_id: "0:1",
        stable_path: ["1:2"],
      },
      page_id: "0:1",
      file_key: "FILEKEY",
      uuid: "uuid-1",
    });
  });

  it("post_comment on a canvas point, on the current page", async () => {
    const { h, sent } = tools();
    await h.toolPostComment({ message: "Here", x: 7, y: 8 });
    expect(writes(sent)[0].body.client_meta).toEqual({ x: 7, y: 8, page_id: "0:1" });
  });

  it("post_comment checks its arguments before sending anything", async () => {
    const { h, sent } = tools();
    expect(text(await h.toolPostComment({ nodeId: "1:2" }))).toBe("message is required");
    expect(text(await h.toolPostComment({ message: "x" }))).toContain("Pass nodeId, or x and y");
    expect(text(await h.toolPostComment({ message: "x", x: 1 }))).toBe(
      "x and y must both be numbers",
    );
    expect(text(await h.toolPostComment({ message: "x", nodeId: "1:2", x: 1, y: 2 }))).toContain(
      "not both",
    );
    expect(writes(sent)).toHaveLength(0);
  });

  it("reply_comment posts to the thread and refuses a reply id", async () => {
    const { h, sent } = tools();
    expect(JSON.parse(text(await h.toolReplyComment({ threadId: "10", message: "done" })))).toEqual(
      {
        threadId: "10",
        replyId: "98",
      },
    );
    matches(writes(sent)[0], {
      method: "POST",
      url: "/api/file/FILEKEY/comments/10",
      body: { message_meta: [{ t: "done" }], attachments: [], file_key: "FILEKEY", uuid: "uuid-1" },
    });
    const r: any = await h.toolReplyComment({ threadId: "11", message: "done" });
    expect(r.isError).toBe(true);
    expect(writes(sent)).toHaveLength(1);
  });

  it("resolve_comment sends resolved_at as the client does, and reopens", async () => {
    const { h, sent } = tools();
    expect(text(await h.toolResolveComment({ threadId: "10" }))).toBe("Thread #10 resolved.");
    expect(text(await h.toolResolveComment({ threadId: "12", resolved: false }))).toBe(
      "Thread #12 reopened.",
    );
    expect(writes(sent).map((s) => [s.method, s.url, s.body])).toEqual([
      ["PUT", "/api/file/FILEKEY/comments/10", { resolved_at: "true" }],
      ["PUT", "/api/file/FILEKEY/comments/12", { resolved_at: "false" }],
    ]);
    expect(text(await h.toolResolveComment({ threadId: "12" }))).toBe(
      "Thread #12 is already resolved.",
    );
    expect(writes(sent)).toHaveLength(2);
  });

  it("delete_comment deletes your own comment and never someone else's", async () => {
    const { h, sent } = tools();
    expect(text(await h.toolDeleteComment({ commentId: "14" }))).toBe(
      "Reply #14 deleted from thread #10.",
    );
    const r: any = await h.toolDeleteComment({ commentId: "20" });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("not you");
    expect(writes(sent).map((s) => `${s.method} ${s.url}`)).toEqual([
      "DELETE /api/file/FILEKEY/comments/14",
    ]);
  });
});

describe("comment tool surface", () => {
  const writeNames = ["post_comment", "reply_comment", "resolve_comment", "delete_comment"];
  it("lists the writes behind the editing switch, with descriptions that say they change the file", () => {
    const list = mcpToolList();
    for (const name of writeNames) {
      const tool = list.write.find((t) => t.name === name);
      expect(tool?.description).toContain("real file");
      expect(TOOLS.some((t) => t.name === name)).toBe(false);
      expect(TOOL_ANNOTATIONS[name as keyof typeof TOOL_ANNOTATIONS].readOnlyHint).toBe(false);
    }
    expect(TOOL_ANNOTATIONS.delete_comment.destructiveHint).toBe(true);
    expect(
      WRITE_TOOLS.find((t) => t.name === "post_comment")?.inputSchema.properties,
    ).toHaveProperty("fileKey");
  });

  it("get_comments takes the remote server's filters and the old includeResolved", () => {
    const props = TOOLS.find((t) => t.name === "get_comments")!.inputSchema.properties as object;
    for (const p of [
      "nodeId",
      "threadId",
      "pageId",
      "userId",
      "mentionedUserId",
      "resolved",
      "includeResolved",
      "rootOnly",
      "unreadOnly",
      "limit",
      "cursor",
      "fileKey",
    ])
      expect(props).toHaveProperty(p);
  });
});
