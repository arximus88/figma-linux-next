import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ModalViewManager } from "Main/Ui/ModalViewManager";

function makeView() {
  return {
    view: { webContents: { id: 1 }, setVisible: mock() },
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

/** How many times `view` was (re-)added to the window. */
const adds = (win: ReturnType<typeof makeWindow>, view: unknown) =>
  win.contentView.addChildView.mock.calls.filter((c: unknown[]) => c[0] === view).length;

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

  test("construction attaches both overlays hidden", () => {
    expect(adds(win, settings.view)).toBe(1);
    expect(adds(win, changelog.view)).toBe(1);
    expect(settings.view.setVisible).toHaveBeenCalledWith(false);
    expect(changelog.view.setVisible).toHaveBeenCalledWith(false);
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
  });

  test("openSettingsView raises the view, shows it and applies bounds", () => {
    m.openSettingsView();
    expect(adds(win, settings.view)).toBe(2);
    expect(settings.view.setVisible.mock.calls.at(-1)).toEqual([true]);
    expect(settings.updateProps).toHaveBeenCalled();
  });

  test("closeSettingsView hides (never detaches) and posts close", () => {
    m.openSettingsView();
    m.closeSettingsView();
    expect(settings.view.setVisible.mock.calls.at(-1)).toEqual([false]);
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
    expect(settings.postClose).toHaveBeenCalled();
  });

  test("reopening re-adds the view so it lands above tabs attached meanwhile", () => {
    m.openSettingsView();
    m.closeSettingsView();
    m.openSettingsView();
    expect(adds(win, settings.view)).toBe(3);
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
    expect(settings.view.setVisible.mock.calls.at(-1)).toEqual([true]);
  });

  test("changelog open is idempotent and toggles isChangelogViewOpen", () => {
    expect(m.isChangelogViewOpen).toBe(false);
    m.openChangelogView();
    expect(m.isChangelogViewOpen).toBe(true);
    expect(adds(win, changelog.view)).toBe(2);
    m.openChangelogView(); // no-op while already open
    expect(adds(win, changelog.view)).toBe(2);
    m.closeChangelogView();
    expect(m.isChangelogViewOpen).toBe(false);
    expect(changelog.view.setVisible.mock.calls.at(-1)).toEqual([false]);
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
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
