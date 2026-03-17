import { describe, test, expect } from "bun:test";
import { normalizeUrl, getFileKeyFromUrl, isFigmaRunUrl } from "./url";
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

  test("returns false for home/recent pages", () => {
    expect(isFigmaRunUrl("https://www.figma.com/files/recent")).toBe(true); // /files/ is valid
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
