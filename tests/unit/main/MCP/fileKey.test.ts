import { describe, expect, it } from "bun:test";

import { fileKeysOfUrl, readFileKeyArg, urlMatchesFileKey } from "Main/MCP/utils/fileKey";

describe("fileKey routing", () => {
  it("reads the key from every Figma editor URL", () => {
    for (const kind of ["design", "file", "board", "slides", "make", "proto", "jam"]) {
      expect(fileKeysOfUrl(`https://www.figma.com/${kind}/AbC123xyz456/Name?node-id=1-2`)).toEqual([
        "AbC123xyz456",
      ]);
    }
  });

  it("knows the branch key of a branch URL", () => {
    const url = "https://www.figma.com/design/MainKey123456/Name/branch/BranchKey7890/Name";
    expect(fileKeysOfUrl(url)).toEqual(["MainKey123456", "BranchKey7890"]);
    expect(urlMatchesFileKey(url, "BranchKey7890")).toBe(true);
  });

  it("does not match other files, non-file pages or other hosts", () => {
    const url = "https://www.figma.com/design/AbC123xyz456/Name";
    expect(urlMatchesFileKey(url, "AbC123xyz45")).toBe(false);
    expect(urlMatchesFileKey("https://www.figma.com/files/recents", "recents")).toBe(false);
    expect(urlMatchesFileKey("https://evil.example/design/AbC123xyz456/x", "AbC123xyz456")).toBe(
      false,
    );
    expect(urlMatchesFileKey("not a url", "x")).toBe(false);
  });

  it("accepts a bare key or a pasted URL as the argument", () => {
    expect(readFileKeyArg(undefined)).toBeUndefined();
    expect(readFileKeyArg("")).toBeUndefined();
    expect(readFileKeyArg(" AbC123xyz456 ")).toBe("AbC123xyz456");
    expect(readFileKeyArg("https://www.figma.com/design/AbC123xyz456/Name?node-id=1-2")).toBe(
      "AbC123xyz456",
    );
    expect(readFileKeyArg("https://figma.com/design/MainKey123456/N/branch/BranchKey7890/N")).toBe(
      "BranchKey7890",
    );
  });

  it("refuses an argument that is neither, rather than falling back to the active tab", () => {
    expect(() => readFileKeyArg("../../etc")).toThrow(/not a Figma file key/);
    expect(() => readFileKeyArg(42)).toThrow(/must be a string/);
  });
});
