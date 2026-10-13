import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ModalViewManager } from "Main/Ui/ModalViewManager";

function makeView() {
  return {
    view: { webContents: { id: 1 }, setVisible: mock() },
    updateProps: mock(),
    closeDevTools: mock(),
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
  let changelog: ReturnType<typeof makeView>;
  let m: ModalViewManager;

  beforeEach(() => {
    win = makeWindow();
    changelog = makeView();
    m = new ModalViewManager(win as any, changelog as any);
  });

  test("construction attaches the overlay hidden", () => {
    expect(adds(win, changelog.view)).toBe(1);
    expect(changelog.view.setVisible).toHaveBeenCalledWith(false);
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
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

  test("reopening re-adds the view so it lands above tabs attached meanwhile", () => {
    m.openChangelogView();
    m.closeChangelogView();
    m.openChangelogView();
    expect(adds(win, changelog.view)).toBe(3);
    expect(changelog.view.setVisible.mock.calls.at(-1)).toEqual([true]);
  });

  test("syncBounds only re-applies while the overlay is open", () => {
    const bounds = { x: 0, y: 0, width: 1, height: 1 } as any;
    m.syncBounds(bounds);
    expect(changelog.updateProps).not.toHaveBeenCalled();

    m.openChangelogView();
    changelog.updateProps.mockClear();
    m.syncBounds(bounds);
    expect(changelog.updateProps).toHaveBeenCalledWith(bounds);
  });

  test("destroy tears down the view", () => {
    m.destroy();
    expect(changelog.destroy).toHaveBeenCalled();
  });
});
