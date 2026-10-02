import { describe, expect, it } from "bun:test";
import { SECTIONS, SETTINGS, searchSettings } from "../../../src/renderer/Settings/schema";

const ids = (q: string) => searchSettings(q).map((s) => s.id);

describe("Settings search", () => {
  it("matches the start of a word, not any substring", () => {
    expect(ids("port")).toEqual(["mcp-port", "cdp-port"]);
  });

  it("finds a setting by a keyword it does not show", () => {
    expect(ids("zenity")).toEqual(["zenity"]);
    expect(ids("flags")).toEqual(["command-switches"]);
  });

  it("every word has to match", () => {
    expect(ids("mcp port")).toEqual(["mcp-port"]);
  });

  it("an empty query finds nothing", () => {
    expect(ids("   ")).toEqual([]);
  });

  it("a section name finds its settings", () => {
    expect(ids("advanced")).toEqual(["font-dirs", "command-switches"]);
  });
});

describe("Settings schema", () => {
  it("ids are unique and every setting sits in a real section", () => {
    const all = Object.values(SETTINGS);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const s of all) expect(sections.has(s.section)).toBe(true);
  });
});
