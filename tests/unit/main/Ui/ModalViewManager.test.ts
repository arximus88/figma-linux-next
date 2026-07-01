import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ModalViewManager } from "Main/Ui/ModalViewManager";

function makeView() {
  return {
    view: { webContents: { id: 1 } },
    updateProps: mock(),
    closeDevTools: mock(),
    postClose: mock(),
    destroy: mock(),
  };
}

function makeWindow() {
  return {
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    contentView: { addChildView: mock(), removeChildView: mock() },
  };
}

describe("ModalViewManager", () => {
  let win: ReturnType<typeof makeWindow>;
  let settings: ReturnType<typeof makeView>;
  let changelog: ReturnType<typeof makeView>;
  let m: ModalViewManager;

  beforeEach(() => {
    win = makeWindow();
    settings = makeView();
    changelog = makeView();
    m = new ModalViewManager(win as any, settings as any, changelog as any);
  });

  test("openSettingsView attaches the view and applies bounds", () => {
    m.openSettingsView();
    expect(win.contentView.addChildView).toHaveBeenCalledWith(settings.view);
    expect(settings.updateProps).toHaveBeenCalled();
  });

  test("closeSettingsView detaches and posts close", () => {
    m.openSettingsView();
    m.closeSettingsView();
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(settings.view);
    expect(settings.postClose).toHaveBeenCalled();
  });

  test("changelog open is idempotent and toggles isChangelogViewOpen", () => {
    expect(m.isChangelogViewOpen).toBe(false);
    m.openChangelogView();
    expect(m.isChangelogViewOpen).toBe(true);
    expect(win.contentView.addChildView.mock.calls.length).toBe(1);
    m.openChangelogView(); // no-op while already open
    expect(win.contentView.addChildView.mock.calls.length).toBe(1);
    m.closeChangelogView();
    expect(m.isChangelogViewOpen).toBe(false);
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(changelog.view);
  });

  test("syncBounds only re-applies to currently-open overlays", () => {
    const bounds = { x: 0, y: 0, width: 1, height: 1 } as any;
    m.syncBounds(bounds);
    expect(settings.updateProps).not.toHaveBeenCalled();
    expect(changelog.updateProps).not.toHaveBeenCalled();

    m.openSettingsView();
    settings.updateProps.mockClear();
    m.syncBounds(bounds);
    expect(settings.updateProps).toHaveBeenCalledWith(bounds);
    expect(changelog.updateProps).not.toHaveBeenCalled();
  });

  test("destroy tears down both views", () => {
    m.destroy();
    expect(settings.destroy).toHaveBeenCalled();
    expect(changelog.destroy).toHaveBeenCalled();
  });
});
