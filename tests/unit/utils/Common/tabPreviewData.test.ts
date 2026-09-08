import { describe, expect, test } from "bun:test";
import { normalizeTabPreviewData, relativeTime } from "../../../../src/utils/Common/tabPreviewData";

const sample = {
  data: {
    editedAt: "2026-03-10T20:05:02Z",
    thumbnail: {
      url: "https://s3-alpha.figma.com/thumbnails/abc?X-Amz-Signature=1",
      backgroundColor: "rgba(245, 245, 245, 1)",
      fullWidth: false,
    },
  },
};

describe("normalizeTabPreviewData", () => {
  test("keeps the observed Figma shape", () => {
    expect(normalizeTabPreviewData(sample)).toEqual({
      thumbnailUrl: "https://s3-alpha.figma.com/thumbnails/abc?X-Amz-Signature=1",
      backgroundColor: "rgba(245, 245, 245, 1)",
      fullWidth: false,
      editedAt: "2026-03-10T20:05:02Z",
    });
  });
  test("rejects non-https thumbnails and garbage", () => {
    expect(
      normalizeTabPreviewData({ data: { thumbnail: { url: "javascript:alert(1)" } } }),
    ).toBeNull();
    expect(
      normalizeTabPreviewData({ data: { thumbnail: { url: "data:image/png;base64,x" } } }),
    ).toBeNull();
    expect(normalizeTabPreviewData(null)).toBeNull();
    expect(normalizeTabPreviewData({ data: {} })).toBeNull();
    expect(normalizeTabPreviewData("x")).toBeNull();
  });
  test("drops an unparsable editedAt", () => {
    const r = normalizeTabPreviewData({
      data: { editedAt: "yesterday", thumbnail: { url: "https://a/b" } },
    });
    expect(r).toEqual({ thumbnailUrl: "https://a/b" });
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const cases: Array<[string, string]> = [
    ["2026-09-08T11:59:40Z", "just now"],
    ["2026-09-08T11:45:00Z", "15 minutes ago"],
    ["2026-09-08T09:00:00Z", "3 hours ago"],
    ["2026-09-06T12:00:00Z", "2 days ago"],
    ["2026-08-25T12:00:00Z", "2 weeks ago"],
    ["2026-03-10T20:05:02Z", "6 months ago"],
    ["2024-01-01T00:00:00Z", "3 years ago"],
  ];
  for (const [iso, expected] of cases) {
    test(`${iso} → ${expected}`, () => {
      expect(relativeTime(iso, now)).toBe(expected);
    });
  }
  test("empty for garbage", () => {
    expect(relativeTime("nope", now)).toBe("");
  });
});
