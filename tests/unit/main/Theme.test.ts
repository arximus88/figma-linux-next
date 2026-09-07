import { describe, expect, it } from "bun:test";

import { parsePortalColorScheme } from "Main/Theme";

describe("parsePortalColorScheme", () => {
  it("maps the portal's colour-scheme values", () => {
    expect(parsePortalColorScheme("(<uint32 1>,)\n")).toBe(true);
    expect(parsePortalColorScheme("(<uint32 2>,)\n")).toBe(false);
    expect(parsePortalColorScheme("(<uint32 0>,)\n")).toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parsePortalColorScheme("")).toBeNull();
    expect(parsePortalColorScheme("Error: no such interface")).toBeNull();
  });
});
