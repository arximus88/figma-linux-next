/**
 * get_comments and get_versions read figma.com from the page. The scripts run
 * here against a fake fetch answering like /api/file/<key>/comments and
 * /api/versions/<key>.
 */

import { describe, expect, it } from "bun:test";

import { COMMENTS_SCRIPT, VERSIONS_SCRIPT } from "Main/MCP/scripts/history";

function page(routes: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const window: any = {
    INITIAL_OPTIONS: { editing_file: { key: "FILEKEY" } },
    figma: {
      getNodeByIdAsync: async (id: string) => (id === "1:2" ? { name: "Card" } : null),
    },
    ...extra,
  };
  const fetch = async (url: string) => {
    asked.push(url);
    const body = routes[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    };
  };
  const location = { pathname: "/design/FILEKEY/x" };
  const run = (script: string) =>
    new Function("window", "fetch", "location", `return (${script});`)(window, fetch, location);
  return { run, asked };
}

const COMMENTS: { meta: any[] } = {
  meta: [
    {
      id: "10",
      parent_id: null,
      user: { handle: "Anna" },
      created_at: "2026-11-01T09:30:00Z",
      resolved_at: null,
      message: "Make the  title\nbigger",
      client_meta: { node_id: "1:2", node_offset: { x: 1, y: 2 } },
    },
    {
      id: "11",
      parent_id: "10",
      user: { handle: "Bob" },
      created_at: "2026-11-02T10:00:00Z",
      message_meta: [{ t: "Done, " }, { user_annotated: { handle: "Anna" } }],
    },
    {
      id: "12",
      parent_id: null,
      user: { handle: "Bob" },
      created_at: "2026-10-01T10:00:00Z",
      resolved_at: "2026-10-02T10:00:00Z",
      message: "Old",
      client_meta: { x: 10, y: 20 },
    },
  ],
};

describe("get_comments", () => {
  it("lists open threads with the layer they are on and their replies", async () => {
    const { run, asked } = page({ "/api/file/FILEKEY/comments": COMMENTS });
    const { text } = await run(COMMENTS_SCRIPT(false));
    expect(asked).toEqual(["/api/file/FILEKEY/comments"]);
    expect(text).toBe(
      "1 comment thread(s); 1 resolved not shown (includeResolved: true):\n" +
        '#10 on 1:2 "Card" · Anna · 2026-11-01 09:30: Make the title bigger\n' +
        "  ↳ Bob · 2026-11-02 10:00: Done, @Anna",
    );
  });

  it("shows resolved threads when asked", async () => {
    const { run } = page({ "/api/file/FILEKEY/comments": COMMENTS });
    const { text } = await run(COMMENTS_SCRIPT(true));
    expect(text).toContain("#12 · Bob · 2026-10-01 10:00 · resolved: Old");
  });

  it("says so when there are none, and reports figma.com errors", async () => {
    expect(
      (await page({ "/api/file/FILEKEY/comments": { meta: [] } }).run(COMMENTS_SCRIPT(false))).text,
    ).toBe("No comments on this file.");
    const { error } = await page({}).run(COMMENTS_SCRIPT(false));
    expect(error).toBe("figma.com answered 404 for /api/file/FILEKEY/comments");
  });
});

describe("get_versions", () => {
  const VERSIONS = {
    meta: {
      versions: [
        {
          id: "3",
          created_at: "2026-11-05T19:45:22Z",
          user: { handle: "Borys" },
          label: null,
          description: null,
        },
        {
          id: "2",
          created_at: "2026-11-04T08:00:00Z",
          user: { handle: "Anna" },
          label: "Handoff",
          description: "Ready\nfor dev",
        },
        {
          id: "1",
          created_at: "2026-11-01T08:00:00Z",
          user: { handle: "Anna" },
          label: null,
          description: null,
        },
      ],
    },
    pagination: { next_page: "/api/versions/FILEKEY?page=2" },
  };

  it("lists versions newest first, named ones with label and description", async () => {
    const { run } = page({ "/api/versions/FILEKEY": VERSIONS });
    const { text } = await run(VERSIONS_SCRIPT(2, false));
    expect(text).toBe(
      "Versions of this file, newest first (2 of 3 loaded): Older versions exist beyond this page.\n" +
        "- 3 · 2026-11-05 19:45 · Borys · autosave\n" +
        '- 2 · 2026-11-04 08:00 · Anna · "Handoff" — Ready for dev',
    );
  });

  it("keeps only named versions when asked", async () => {
    const { run } = page({ "/api/versions/FILEKEY": VERSIONS });
    const { text } = await run(VERSIONS_SCRIPT(20, true));
    expect(text.split("\n").slice(1)).toEqual([
      '- 2 · 2026-11-04 08:00 · Anna · "Handoff" — Ready for dev',
    ]);
  });

  it("finds the file key in the URL when the page has no editing_file", async () => {
    const { run, asked } = page(
      { "/api/versions/FILEKEY": VERSIONS },
      { INITIAL_OPTIONS: {}, figma: undefined },
    );
    await run(VERSIONS_SCRIPT(1, false));
    expect(asked).toEqual(["/api/versions/FILEKEY"]);
  });
});
