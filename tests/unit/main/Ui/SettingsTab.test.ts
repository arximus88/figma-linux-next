import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SettingsTab } from "Main/Ui/SettingsTab";

function makeHost() {
  return {
    view: { setVisible: mock(), setBounds: mock() },
    bounds: () => ({ x: 0, y: 40, width: 800, height: 560 }),
    hideCurrentTab: mock(),
    refocusCurrentTab: mock(),
    notifyPanel: mock(),
  };
}

describe("SettingsTab", () => {
  let host: ReturnType<typeof makeHost>;
  let tab: SettingsTab;

  beforeEach(() => {
    host = makeHost();
    tab = new SettingsTab(host);
  });

  test("show opens the tab, covers the current one and focuses it in the panel", () => {
    tab.show();
    expect(tab.isOpen && tab.isShown).toBe(true);
    expect(host.hideCurrentTab.mock.calls.length).toBe(1);
    expect(host.view.setBounds).toHaveBeenCalledWith(host.bounds());
    expect(host.view.setVisible.mock.calls.at(-1)).toEqual([true]);
    expect(host.notifyPanel.mock.calls).toEqual([
      ["settingsTabOpened"],
      ["focusTab", "settingsTab"],
    ]);
  });

  test("a second show does not open a second tab", () => {
    tab.show();
    tab.show();
    const opened = host.notifyPanel.mock.calls.filter(
      ([c]: unknown[]) => c === "settingsTabOpened",
    );
    expect(opened.length).toBe(1);
    expect(host.hideCurrentTab.mock.calls.length).toBe(1);
  });

  test("hide leaves the tab in the strip", () => {
    tab.show();
    tab.hide();
    expect(tab.isOpen).toBe(true);
    expect(tab.isShown).toBe(false);
    expect(host.view.setVisible.mock.calls.at(-1)).toEqual([false]);
  });

  test("closing the tab in front brings the tab underneath back", () => {
    tab.show();
    tab.close();
    expect(tab.isOpen).toBe(false);
    expect(host.refocusCurrentTab.mock.calls.length).toBe(1);
    expect(host.notifyPanel.mock.calls.at(-1)).toEqual(["settingsTabClosed"]);
  });

  test("closing it from the background leaves the current tab alone", () => {
    tab.show();
    tab.hide();
    tab.close();
    expect(host.refocusCurrentTab).not.toHaveBeenCalled();
  });

  test("bounds follow the window only while it is on screen", () => {
    tab.syncBounds();
    expect(host.view.setBounds).not.toHaveBeenCalled();
    tab.show();
    tab.syncBounds();
    expect(host.view.setBounds.mock.calls.length).toBe(2);
  });
});
