import { describe, expect, it } from "bun:test";
import {
  type EditableSettings,
  pendingRestart,
  pickEditable,
  planSettingsUpdate,
} from "Utils/Common/settingsEdit";
import { BASE_DEFAULT_SETTINGS } from "Utils/Common/defaultSettings";

function base(): EditableSettings {
  return pickEditable(structuredClone(BASE_DEFAULT_SETTINGS) as Types.SettingsInterface);
}

function edit(fn: (s: EditableSettings) => void): EditableSettings {
  const s = base();
  fn(s);
  return s;
}

describe("pickEditable", () => {
  it("keeps main's own state out of what Settings sends", () => {
    const full = structuredClone(BASE_DEFAULT_SETTINGS) as Types.SettingsInterface;
    full.userId = "u1";
    full.app.recentlyClosedTabs = [{ title: "A", url: "https://figma.com/a" } as Types.SavedTab];
    full.app.lastExportDir = "/tmp/last";

    const picked = pickEditable(full) as any;

    expect(picked.userId).toBeUndefined();
    expect(picked.app.recentlyClosedTabs).toBeUndefined();
    expect(picked.app.windowsState).toBeUndefined();
    expect(picked.app.lastExportDir).toBeUndefined();
    expect(picked.app.exportDir).toBe(full.app.exportDir);
  });

  it("copies arrays instead of aliasing them", () => {
    const full = structuredClone(BASE_DEFAULT_SETTINGS) as Types.SettingsInterface;
    const picked = pickEditable(full);
    picked.app.fontDirs.push("/x");
    expect(full.app.fontDirs).not.toContain("/x");
  });
});

describe("planSettingsUpdate", () => {
  it("no change, no effects", () => {
    expect(planSettingsUpdate(base(), base()).effects).toEqual([]);
  });

  it("each live setting announces its own effect", () => {
    const { effects } = planSettingsUpdate(
      base(),
      edit((s) => {
        s.app.trayEnabled = !s.app.trayEnabled;
        s.app.useZenity = !s.app.useZenity;
        s.mcp.enableWriteTools = !s.mcp.enableWriteTools;
        s.app.frameStyleAuto = !s.app.frameStyleAuto;
        s.app.tabHoverPreviews = !s.app.tabHoverPreviews;
      }),
    );
    expect(effects.map((e) => e.type as string).sort()).toEqual(
      ["dialogs", "frameStyle", "mcpWriteTools", "panelLayout", "tray"].sort(),
    );
  });

  it("a new valid server port restarts the MCP server on it", () => {
    const { next, effects } = planSettingsUpdate(
      base(),
      edit((s) => (s.mcp.serverPort = 4000)),
    );
    expect(next.mcp.serverPort).toBe(4000);
    expect(effects).toContainEqual({ type: "mcpServer", enabled: true, port: 4000 });
  });

  it("a half-typed port is not saved and restarts nothing", () => {
    const current = base();
    const { next, effects } = planSettingsUpdate(
      current,
      edit((s) => (s.mcp.serverPort = 38)),
    );
    expect(next.mcp.serverPort).toBe(current.mcp.serverPort);
    expect(effects).toEqual([]);
  });

  it("ports that collide are both kept at their current values", () => {
    const current = base();
    const { next } = planSettingsUpdate(
      current,
      edit((s) => (s.mcp.serverPort = current.mcp.remoteDebugPort)),
    );
    expect(next.mcp.serverPort).toBe(current.mcp.serverPort);
    expect(next.mcp.remoteDebugPort).toBe(current.mcp.remoteDebugPort);
  });

  it("blank command-switch rows are dropped, the rest trimmed", () => {
    const { next } = planSettingsUpdate(
      base(),
      edit((s) => {
        s.app.commandSwitches = [{ switch: "" }, { switch: " enable-foo ", value: "1" }];
      }),
    );
    expect(next.app.commandSwitches).toEqual([{ switch: "enable-foo", value: "1" }]);
  });
});

describe("pendingRestart", () => {
  it("lists settings saved since launch that only apply at startup", () => {
    const launched = base();
    const saved = edit((s) => {
      s.app.enableColorSpaceSrgb = !s.app.enableColorSpaceSrgb;
      s.mcp.cdpEnabled = true;
    });
    expect(pendingRestart(launched, saved)).toEqual(["sRGB color space", "Chrome DevTools"]);
  });

  it("flipping a setting back clears its restart prompt", () => {
    expect(pendingRestart(base(), base())).toEqual([]);
  });

  it("a CDP port change while CDP stays off needs no restart", () => {
    const saved = edit((s) => (s.mcp.remoteDebugPort = 9333));
    expect(pendingRestart(base(), saved)).toEqual([]);
  });

  it("a blank switch row being typed is not a pending change", () => {
    const saved = edit((s) => s.app.commandSwitches.push({ switch: "" }));
    expect(pendingRestart(base(), saved)).toEqual([]);
  });

  it("live settings never ask for a restart", () => {
    const saved = edit((s) => {
      s.app.trayEnabled = !s.app.trayEnabled;
      s.mcp.serverPort = 4000;
      s.ui.scalePanel = 1.2;
    });
    expect(pendingRestart(base(), saved)).toEqual([]);
  });
});
