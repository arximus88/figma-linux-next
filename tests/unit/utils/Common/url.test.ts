import { describe, test, expect } from "bun:test";
import {
  normalizeUrl,
  getFileKeyFromUrl,
  getTabDedupKey,
  isFigmaRunUrl,
  isFileBrowserUrl,
} from "Utils/Common/url";
import { HOMEPAGE } from "Const";

describe("normalizeUrl", () => {
  test("replaces figma:// protocol with HOMEPAGE", () => {
    expect(normalizeUrl("figma://file/123")).toBe(`${HOMEPAGE}/file/123`);
  });

  test("does not modify standard https URLs", () => {
    expect(normalizeUrl("https://www.figma.com/file/123")).toBe("https://www.figma.com/file/123");
  });

  test("does not modify other protocols", () => {
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeUrl("ftp://example.com")).toBe("ftp://example.com");
  });

  test("does not modify empty string", () => {
    expect(normalizeUrl("")).toBe("");
  });

  test("does not modify URLs starting with figma: but without //", () => {
    expect(normalizeUrl("figma:file")).toBe("figma:file");
  });
});

describe("getFileKeyFromUrl", () => {
  test("extracts key from /design/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/design/ABC123xyz/my-file")).toBe("ABC123xyz");
  });

  test("extracts key from /file/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/file/XYZ789/name")).toBe("XYZ789");
  });

  test("extracts key from /board/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/board/KEY001/board-name")).toBe("KEY001");
  });

  test("extracts key from /proto/ URL", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/proto/PROTO1/prototype")).toBe("PROTO1");
  });

  test("extracts key from URL with node-id query param", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/design/ABC123xyz/file?node-id=1-2")).toBe(
      "ABC123xyz",
    );
  });

  test("returns null for home/recent pages", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/files/recent")).toBeNull();
    expect(getFileKeyFromUrl("https://www.figma.com/desktop_new_tab")).toBeNull();
  });

  test("returns null for community URLs", () => {
    expect(getFileKeyFromUrl("https://www.figma.com/@figma_linux")).toBeNull();
  });

  test("returns null for invalid URL", () => {
    expect(getFileKeyFromUrl("not-a-url")).toBeNull();
    expect(getFileKeyFromUrl("")).toBeNull();
  });
});

describe("getTabDedupKey", () => {
  test("returns 'doc:<key>' for file/design/board URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/file/ABC123/x")).toBe("doc:ABC123");
    expect(getTabDedupKey("https://www.figma.com/design/ABC123/x")).toBe("doc:ABC123");
    expect(getTabDedupKey("https://www.figma.com/board/ABC123/x")).toBe("doc:ABC123");
  });

  test("returns 'proto:<key>' for prototype URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/proto/ABC123/x")).toBe("proto:ABC123");
    expect(getTabDedupKey("https://www.figma.com/proto/ABC123?node-id=1-2")).toBe("proto:ABC123");
  });

  test("file and proto URLs for the same key produce different dedup keys", () => {
    expect(getTabDedupKey("https://www.figma.com/file/SAME/a")).not.toBe(
      getTabDedupKey("https://www.figma.com/proto/SAME/b"),
    );
  });

  test("file, design and board with the same key dedupe together", () => {
    const a = getTabDedupKey("https://www.figma.com/file/SAME/a");
    const b = getTabDedupKey("https://www.figma.com/design/SAME/b");
    const c = getTabDedupKey("https://www.figma.com/board/SAME/c");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test("returns null for non-figma and malformed URLs", () => {
    expect(getTabDedupKey("https://www.figma.com/community/file/ABC")).toBeNull();
    expect(getTabDedupKey("not-a-url")).toBeNull();
    expect(getTabDedupKey("")).toBeNull();
  });
});

describe("isFigmaRunUrl", () => {
  test("returns true for design file URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/design/ABC123/my-file")).toBe(true);
  });

  test("returns true for file URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/file/ABC123/name")).toBe(true);
  });

  test("returns true for proto URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/proto/ABC123/proto")).toBe(true);
  });

  test("returns true for board URLs", () => {
    expect(isFigmaRunUrl("https://www.figma.com/board/ABC123/board")).toBe(true);
  });

  test("returns true for figma:// protocol", () => {
    expect(isFigmaRunUrl("figma://file/ABC123")).toBe(true);
  });

  test("returns true for /files/ browser paths (file browser, not a design file)", () => {
    expect(isFigmaRunUrl("https://www.figma.com/files/recent")).toBe(true);
    expect(isFigmaRunUrl("https://www.figma.com/files/team/123/my-team")).toBe(true);
  });

  test("returns false for non-browser figma pages", () => {
    expect(isFigmaRunUrl("https://www.figma.com/desktop_new_tab")).toBe(false);
  });

  test("returns false for non-figma URLs", () => {
    expect(isFigmaRunUrl("https://google.com")).toBe(false);
    expect(isFigmaRunUrl("https://notion.so/page")).toBe(false);
  });

  test("returns false for invalid input", () => {
    expect(isFigmaRunUrl("not-a-url")).toBe(false);
    expect(isFigmaRunUrl("")).toBe(false);
  });
});

describe("isFileBrowserUrl", () => {
  test("returns true for /files/recent", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/recent")).toBe(true);
  });

  test("returns true for team browser URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/team/123456789/my-team")).toBe(true);
  });

  test("returns true for project browser URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/files/project/987654/my-project")).toBe(true);
  });

  test("returns false for design file URL", () => {
    expect(isFileBrowserUrl("https://www.figma.com/design/ABC123/my-file")).toBe(false);
  });

  test("returns false for old /file/ URL (singular)", () => {
    expect(isFileBrowserUrl("https://www.figma.com/file/ABC123/name")).toBe(false);
  });

  test("returns false for non-figma URL", () => {
    expect(isFileBrowserUrl("https://google.com/files/something")).toBe(false);
  });

  test("returns false for invalid input", () => {
    expect(isFileBrowserUrl("not-a-url")).toBe(false);
    expect(isFileBrowserUrl("")).toBe(false);
  });
});
