/**
 * get_versions reads figma.com from the page. The script runs here against a
 * fake fetch answering like /api/versions/<key>. Comments: comments.test.ts.
 */

import { describe, expect, it } from "bun:test";

import { VERSIONS_SCRIPT } from "Main/MCP/scripts/history";

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
