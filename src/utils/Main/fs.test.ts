import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "fs";
import { mkdirIfNotExists, access, accessSync, mkPath } from "./fs";

describe("fs utils", () => {
  describe("access", () => {
    it("returns true when file exists", async () => {
      const spy = spyOn(fs.promises, "access").mockResolvedValueOnce(undefined as never);
      const result = await access("/path/to/existing");
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith("/path/to/existing");
      spy.mockRestore();
    });

    it("returns false when file does not exist", async () => {
      const spy = spyOn(fs.promises, "access").mockRejectedValueOnce(new Error("ENOENT"));
      const result = await access("/path/to/missing");
      expect(result).toBe(false);
      expect(spy).toHaveBeenCalledWith("/path/to/missing");
      spy.mockRestore();
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
      const spy = spyOn(fs, "mkdir").mockImplementationOnce((((_path: any, cb: any) => cb(null)) as any));
      await mkdirIfNotExists("/new/dir");
      expect(spy).toHaveBeenCalledWith("/new/dir", expect.any(Function));
      spy.mockRestore();
    });

    it("does not throw when dir already exists (EEXIST)", async () => {
      const spy = spyOn(fs, "mkdir").mockImplementationOnce((((_path: any, cb: any) => {
        cb(Object.assign(new Error("EEXIST"), { code: "EEXIST" }));
      }) as any));
      await expect(mkdirIfNotExists("/existing/dir")).resolves.toBeUndefined();
      spy.mockRestore();
    });

    it("throws for other errors", async () => {
      const spy = spyOn(fs, "mkdir").mockImplementationOnce((((_path: any, cb: any) => {
        cb(Object.assign(new Error("EACCES"), { code: "EACCES" }));
      }) as any));
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
