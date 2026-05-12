import { describe, expect, it } from "bun:test";
import { parseChangelog, renderInline } from "../../../../src/renderer/Changelog/parseChangelog";

const SAMPLE = `# Changelog

## [Unreleased]

---

## [0.13.5] - 2026-04-14

### Fixed

- **Extensions: file type whitelist removed** — desc ([#23](https://github.com/foo/bar/pull/23))
- **MainTab: external URLs** — go via shell.openExternal

### Added

- **AUR: \`figma-linux-next-bin\` package** — prebuilt binary

---

## [0.13.4] - 2026-04-06

### Added

- **GPU: \`DirectRenderingDisplayCompositor\`** — enabled on X11
`;

describe("parseChangelog", () => {
  it("ignores the Unreleased section and returns released versions in order", () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries.map((e) => e.version)).toEqual(["0.13.5", "0.13.4"]);
  });

  it("captures date and sections", () => {
    const entries = parseChangelog(SAMPLE);
    expect(entries[0].date).toBe("2026-04-14");
    expect(entries[0].sections.map((s) => s.category)).toEqual(["Fixed", "Added"]);
    expect(entries[0].sections[0].items).toHaveLength(2);
    expect(entries[0].sections[1].items).toHaveLength(1);
  });

  it("returns empty list for input without versioned sections", () => {
    expect(parseChangelog("# Changelog\n\nNothing here yet.")).toEqual([]);
  });
});

describe("renderInline", () => {
  it("escapes HTML before applying markdown", () => {
    const html = renderInline('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rewrites markdown links to anchors with data-url", () => {
    const html = renderInline("see [#23](https://example.com/pr/23)");
    expect(html).toContain('data-url="https://example.com/pr/23"');
    expect(html).toContain(">#23<");
  });

  it("strips javascript: links", () => {
    const html = renderInline("[bad](javascript:alert(1))");
    expect(html).not.toContain("data-url=");
    expect(html).toContain("bad");
  });

  it("renders **bold** and `code`", () => {
    const html = renderInline("**Title** uses `flag`");
    expect(html).toContain("<strong>Title</strong>");
    expect(html).toContain("<code>flag</code>");
  });
});
