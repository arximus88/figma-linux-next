import { describe, test, expect } from "bun:test";
import { normalizeUrl } from "./url";
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
