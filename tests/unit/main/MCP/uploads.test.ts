import { describe, expect, it } from "bun:test";

import { classifyUpload, UPLOAD_MAX_BYTES } from "Main/MCP/utils/uploads";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const text = (s: string) => new TextEncoder().encode(s);

describe("upload type check", () => {
  it("trusts the bytes over the label", () => {
    expect(classifyUpload("image/png", PNG)).toBe("image/png");
    expect(classifyUpload("image/png", JPEG)).toBe("image/jpeg");
    expect(classifyUpload(undefined, PNG)).toBe("image/png");
  });

  it("accepts an SVG document, with or without a prolog", () => {
    expect(classifyUpload("image/svg+xml", text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      "image/svg+xml",
    );
    expect(
      classifyUpload(
        "image/svg+xml; charset=utf-8",
        text('<?xml version="1.0"?>\n<!-- x -->\n<svg width="1">'),
      ),
    ).toBe("image/svg+xml");
  });

  it("refuses text dressed up as an image, and HTML dressed up as SVG", () => {
    expect((classifyUpload("image/png", text("hello")) as { error: string }).error).toContain(
      "unsupported asset",
    );
    expect(classifyUpload("image/svg+xml", text("<html><script>alert(1)</script>"))).toEqual({
      error: "body is not an SVG document",
    });
  });

  it("refuses empty and oversized bodies", () => {
    expect(classifyUpload("image/png", new Uint8Array())).toEqual({ error: "empty body" });
    const big = new Uint8Array(UPLOAD_MAX_BYTES + 1);
    big.set(PNG);
    expect((classifyUpload("image/png", big) as { error: string }).error).toContain("10 MB");
  });
});
