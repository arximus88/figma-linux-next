import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "fs";
import { mkdirIfNotExists, access, accessSync, mkPath } from "Utils/Main/fs";

describe("fs utils", () => {
  describe("access", () => {
    it("returns true when file exists", async () => {
      // Use this test file itself — guaranteed to exist in any environment
      expect(await access(__filename)).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      expect(await access("/tmp/figma-linux-next-definitely-missing-" + Math.random())).toBe(false);
    });
  });

  describe("accessSync", () => {
    it("returns true when path exists", () => {
      expect(accessSync("/tmp")).toBe(true);
    });

    it("returns false when path does not exist", () => {
      expect(accessSync("/tmp/figma-linux-next-definitely-missing-" + Math.random())).toBe(false);
    });
  });

  describe("mkdirIfNotExists", () => {
    it("creates dir when missing", async () => {
      const spy = spyOn(fs.promises, "mkdir").mockResolvedValueOnce(undefined);
      await mkdirIfNotExists("/new/dir");
      expect(spy).toHaveBeenCalledWith("/new/dir");
      spy.mockRestore();
    });

    it("does not throw when dir already exists (EEXIST)", async () => {
      const spy = spyOn(fs.promises, "mkdir").mockRejectedValueOnce(
        Object.assign(new Error("EEXIST"), { code: "EEXIST" }),
      );
      await expect(mkdirIfNotExists("/existing/dir")).resolves.toBeUndefined();
      spy.mockRestore();
    });

    it("throws for other errors", async () => {
      const spy = spyOn(fs.promises, "mkdir").mockRejectedValueOnce(
        Object.assign(new Error("EACCES"), { code: "EACCES" }),
      );
      await expect(mkdirIfNotExists("/no/access/dir")).rejects.toThrow("EACCES");
      spy.mockRestore();
    });
  });

  describe("mkPath", () => {
    it("calls fs.promises.mkdir with recursive true", async () => {
      const spy = spyOn(fs.promises, "mkdir").mockResolvedValueOnce("/path/to/new/dir");
      await mkPath("/path/to/new/dir");
      expect(spy).toHaveBeenCalledWith("/path/to/new/dir", { recursive: true });
      spy.mockRestore();
    });
  });
});
