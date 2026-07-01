import { beforeEach, describe, expect, mock, test } from "bun:test";

const settings = { app: { panelHeight: 40 } };
mock.module("Main/Storage", () => ({ storage: { settings } }));

import { TOPPANELHEIGHT } from "Const";
import { WindowGeometry } from "Main/Ui/WindowGeometry";

function makeWindow(width: number, height: number) {
  return { getContentBounds: () => ({ x: 0, y: 0, width, height }) } as any;
}

describe("WindowGeometry.calcBoundsForTabView", () => {
  beforeEach(() => {
    settings.app.panelHeight = 40;
  });

  test("offsets the tab view below the panel using the full content size", () => {
    const g = new WindowGeometry(makeWindow(800, 600));
    expect(g.calcBoundsForTabView()).toEqual({ x: 0, y: 40, width: 800, height: 560 });
  });

  test("falls back to 1200x900 when content bounds are zero", () => {
    const g = new WindowGeometry(makeWindow(0, 0));
    expect(g.calcBoundsForTabView()).toEqual({ x: 0, y: 40, width: 1200, height: 860 });
  });

  test("falls back to TOPPANELHEIGHT when panelHeight is unset", () => {
    settings.app.panelHeight = 0;
    const g = new WindowGeometry(makeWindow(1000, 700));
    expect(g.calcBoundsForTabView()).toEqual({
      x: 0,
      y: TOPPANELHEIGHT,
      width: 1000,
      height: 700 - TOPPANELHEIGHT,
    });
  });
});
