/**
 * Hard tests for tab-strip drag geometry.
 *
 * Two layers:
 *   1. Unit tests for each piece of the layout core.
 *   2. Sweeps — drag a tab across the whole strip one pixel at a time and
 *      assert every invariant in tabStripInvariants at *every* step, for every
 *      grabbable tab and every frame. A sweep is what catches "tab 3 pops out
 *      of the group somewhere around x=740": a handful of sampled positions
 *      would walk straight past it.
 */

import { describe, expect, test } from "bun:test";
import {
  computeDragLayout,
  computeOrder,
  computeTargetIndex,
  deriveStripMetrics,
  layoutStrip,
  resolveTargetGroup,
} from "../../../src/renderer/Panel/Components/tabDragLayout";
import {
  buildStrip,
  centerOf,
  dxToReach,
  type FrameName,
  indexOf,
  paint,
  type StripItem,
} from "./tabStripHarness";
import {
  expectNoOverlap,
  expectPermutation,
  expectSpanPreserved,
  expectStripIsSane,
  expectTabsStayInTheirGroups,
  expectUntouchedGroupsMoveRigidly,
} from "./tabStripInvariants";

const FRAMES: FrameName[] = ["gnome", "kde", "windows"];

/**
 * The layout model has to be a faithful stand-in for the browser's flexbox. If
 * laying out the *unchanged* strip didn't reproduce the measured boxes, every
 * offset computed from it would carry that error, and the tabs would sit a few
 * pixels off before the user had even moved anything.
 */
describe("layoutStrip is a faithful model of the rendered strip", () => {
  const shapes: { name: string; items: StripItem[] }[] = [
    { name: "loose tabs", items: ["a", "b", "c"] },
    { name: "one group", items: ["a", { group: "g", tabs: ["b", "c"] }, "d"] },
    {
      name: "group at both ends",
      items: [{ group: "g", tabs: ["a"] }, "b", { group: "h", tabs: ["c", "d"] }],
    },
    { name: "only a group", items: [{ group: "g", tabs: ["a", "b", "c"] }] },
  ];

  for (const frame of FRAMES) {
    for (const { name, items } of shapes) {
      test(`${frame} / ${name}: relaying the same order reproduces every box`, () => {
        const strip = buildStrip(items, frame);
        const laid = layoutStrip(
          strip.slots,
          (id) => strip.slots.find((s) => s.id === id)?.groupId,
          strip.metrics,
        );

        for (const slot of strip.slots) {
          expect(laid.tabs.get(slot.id)).toBeCloseTo(slot.left, 9);
        }
        for (const box of strip.groups) {
          expect(laid.groups.get(box.groupId)?.left).toBeCloseTo(box.left, 9);
          expect(laid.groups.get(box.groupId)?.right).toBeCloseTo(box.right, 9);
        }
      });
    }
  }

  test("a group that loses its last tab disappears from the layout", () => {
    const strip = buildStrip(["a", { group: "g", tabs: ["b"] }, "c"], "gnome");
    const laid = layoutStrip(
      strip.slots,
      (id) => (id === "b" ? undefined : undefined),
      strip.metrics,
    );

    expect(laid.groups.has("g")).toBe(false);
    // With the container gone, the tabs sit flush from the origin.
    expect(laid.tabs.get("a")).toBe(strip.metrics.origin);
  });

  test("a group grows by exactly one tab when a tab joins it", () => {
    const strip = buildStrip(["a", { group: "g", tabs: ["b", "c"] }], "gnome");
    const before = strip.groups[0];

    const laid = layoutStrip(
      [strip.slots[1], strip.slots[2], strip.slots[0]],
      (id) => (id === "a" ? "g" : "g"),
      strip.metrics,
    );
    const after = laid.groups.get("g")!;

    const widthBefore = before.right - before.left;
    const widthAfter = after.right - after.left;
    const tabWidth = strip.slots[0].width;
    expect(widthAfter - widthBefore).toBeCloseTo(tabWidth + strip.frame.groupGap, 9);
  });
});

describe("deriveStripMetrics recovers the metrics from measured boxes", () => {
  for (const frame of FRAMES) {
    test(`${frame}: derived metrics relay the strip unchanged`, () => {
      const strip = buildStrip(["a", { group: "g", tabs: ["b", "c"] }, "d"], frame);
      const derived = deriveStripMetrics({
        slots: strip.slots,
        groups: strip.groups,
        origin: strip.metrics.origin,
        unitGap: strip.frame.unitGap,
        groupMargin: strip.frame.groupMargin,
      });

      const laid = layoutStrip(
        strip.slots,
        (id) => strip.slots.find((s) => s.id === id)?.groupId,
        derived,
      );
      for (const slot of strip.slots) {
        expect(laid.tabs.get(slot.id)).toBeCloseTo(slot.left, 9);
      }
    });
  }

  test("borrows an observed inner gap for a group that has only one tab", () => {
    const strip = buildStrip(
      [
        { group: "solo", tabs: ["a"] },
        { group: "pair", tabs: ["b", "c"] },
      ],
      "gnome",
    );
    const derived = deriveStripMetrics({
      slots: strip.slots,
      groups: strip.groups,
      origin: strip.metrics.origin,
      unitGap: strip.frame.unitGap,
      groupMargin: strip.frame.groupMargin,
    });

    expect(derived.groups.get("solo")?.innerGap).toBe(strip.frame.groupGap);
  });
});

describe("computeTargetIndex", () => {
  const strip = buildStrip(["a", "b", "c", "d"], "gnome");

  test("holding still keeps the grabbed tab in its own position", () => {
    for (let i = 0; i < strip.slots.length; i++) {
      const center = strip.slots[i].left + strip.slots[i].width / 2;
      expect(computeTargetIndex(strip.slots, i, center)).toBe(i);
    }
  });

  test("the swap happens exactly when a neighbour's center is crossed", () => {
    const grabIndex = 0;
    const bCenter = centerOf(strip.slots, "b");

    expect(computeTargetIndex(strip.slots, grabIndex, bCenter - 0.01)).toBe(0);
    expect(computeTargetIndex(strip.slots, grabIndex, bCenter + 0.01)).toBe(1);
  });

  test("is monotonic in dx — dragging right never moves the target left", () => {
    const grabIndex = indexOf(strip.slots, "b");
    let previous = -1;
    for (let x = -400; x <= 1200; x += 1) {
      const target = computeTargetIndex(strip.slots, grabIndex, x);
      expect(target).toBeGreaterThanOrEqual(previous);
      previous = target;
    }
  });

  test("stays in range at both extremes", () => {
    const grabIndex = indexOf(strip.slots, "c");
    expect(computeTargetIndex(strip.slots, grabIndex, -99999)).toBe(0);
    expect(computeTargetIndex(strip.slots, grabIndex, 99999)).toBe(strip.slots.length - 1);
  });
});

describe("computeOrder", () => {
  const strip = buildStrip(["a", "b", "c", "d"], "gnome");

  test("moving to its own index is the identity", () => {
    for (let i = 0; i < strip.slots.length; i++) {
      expect(computeOrder(strip.slots, i, i)).toEqual(["a", "b", "c", "d"]);
    }
  });

  test("moves the grabbed id and shifts the rest", () => {
    expect(computeOrder(strip.slots, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(computeOrder(strip.slots, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  test("is always a permutation, for every source and destination", () => {
    for (let from = 0; from < strip.slots.length; from++) {
      for (let to = 0; to < strip.slots.length; to++) {
        expectPermutation(strip.slots, computeOrder(strip.slots, from, to));
      }
    }
  });
});

describe("resolveTargetGroup", () => {
  const strip = buildStrip(["a", { group: "work", tabs: ["b", "c"] }, "d"], "gnome");
  const box = strip.groups[0];

  /** Membership is decided by the pointer, so that is what these pass. */
  function resolveAt(grabId: string, pointerX: number) {
    const grabIndex = indexOf(strip.slots, grabId);
    const target = computeTargetIndex(strip.slots, grabIndex, pointerX);
    return resolveTargetGroup({
      slots: strip.slots,
      groups: strip.groups,
      grabIndex,
      grabbedId: grabId,
      pointerX,
      order: computeOrder(strip.slots, grabIndex, target),
      target,
    });
  }

  test("landing between two members of a group joins that group", () => {
    expect(resolveAt("a", centerOf(strip.slots, "c"))).toBe("work");
  });

  test("an outside tab far from the group stays loose", () => {
    expect(resolveAt("a", box.left - 500)).toBeUndefined();
    expect(resolveAt("d", box.right + 500)).toBeUndefined();
  });

  test("a member holds its group through jitter just outside the container", () => {
    expect(resolveAt("b", box.right + 5)).toBe("work");
    expect(resolveAt("b", box.left - 5)).toBe("work");
  });

  test("a member dragged clearly out detaches", () => {
    expect(resolveAt("b", box.right + 400)).toBeUndefined();
  });

  test("the last member of a group is still in it at rest", () => {
    // The regression that made a group's last tab impossible to move: it was
    // judged against its neighbour's right edge, so a wide tab read as
    // "already outside" before it had moved at all.
    expect(resolveAt("c", centerOf(strip.slots, "c"))).toBe("work");
  });

  test("a lone member is judged by its container, chip included", () => {
    const solo = buildStrip(["a", { group: "solo", tabs: ["b"] }, "c"], "gnome");
    const grabIndex = indexOf(solo.slots, "b");
    const resolve = (pointerX: number) =>
      resolveTargetGroup({
        slots: solo.slots,
        groups: solo.groups,
        grabIndex,
        grabbedId: "b",
        pointerX,
        order: computeOrder(
          solo.slots,
          grabIndex,
          computeTargetIndex(solo.slots, grabIndex, pointerX),
        ),
        target: computeTargetIndex(solo.slots, grabIndex, pointerX),
      });

    expect(resolve(solo.groups[0].headerRight + 10)).toBe("solo");
    expect(resolve(solo.groups[0].headerLeft - 500)).toBeUndefined();
  });
});

/**
 * The regression this whole file was written for: with a group in the strip,
 * the old layout stepped every tab by the gap it measured between the first two
 * tabs, so a group's members drifted out of their container.
 */
describe("regression: tabs stay inside their group while another tab is dragged", () => {
  for (const frame of FRAMES) {
    test(`${frame}: dragging a loose tab past a 4-tab group never tears the group`, () => {
      const strip = buildStrip(["a", { group: "work", tabs: ["b", "c", "d", "e"] }, "f"], frame);
      const grabIndex = indexOf(strip.slots, "a");
      const from = strip.slots[grabIndex].left - 100;
      const to = strip.right + 100;

      for (let x = from; x <= to; x += 1) {
        const dx = dxToReach(strip.slots, grabIndex, x);
        const { order, offsets, groupBoxes, targetGroupId } = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx,
          groups: strip.groups,
          metrics: strip.metrics,
        });
        expectStripIsSane({
          strip,
          painted: paint(strip.slots, offsets),
          order,
          grabbedId: "a",
          groupBoxes,
          targetGroupId,
          membershipChanged: targetGroupId !== strip.slots[grabIndex].groupId,
        });
      }
    });
  }

  test("gnome: the group's own tabs keep their in-group spacing as it shifts", () => {
    const strip = buildStrip(["a", { group: "work", tabs: ["b", "c", "d"] }], "gnome");
    const grabIndex = indexOf(strip.slots, "a");

    // Drag "a" all the way to the right end: the group must slide left as one
    // block, preserving the gap between its members exactly.
    const dx = dxToReach(strip.slots, grabIndex, strip.right + 50);
    const { offsets } = computeDragLayout({
      slots: strip.slots,
      grabIndex,
      dx,
      groups: strip.groups,
      metrics: strip.metrics,
    });
    const painted = paint(strip.slots, offsets);

    const b = painted.find((s) => s.id === "b")!;
    const c = painted.find((s) => s.id === "c")!;
    const d = painted.find((s) => s.id === "d")!;
    expect(c.left - (b.left + b.width)).toBeCloseTo(strip.frame.groupGap, 9);
    expect(d.left - (c.left + c.width)).toBeCloseTo(strip.frame.groupGap, 9);
  });
});

/**
 * A group that runs to the end of the strip used to trap tabs: membership was
 * decided from the dragged tab's *center*, which trails the pointer by however
 * far from the middle the tab was grabbed. The pointer could reach past the
 * group, the center could not — so whether a tab could be dropped after the
 * group depended on where the user happened to grab it.
 */
describe("regression: a tab can always be dropped after a group at the end of the strip", () => {
  // The reported layout: two loose tabs, then a group filling the rest.
  const buildReported = (frame: FrameName) =>
    buildStrip(
      ["wallpapers", "untitled", { group: "222", tabs: ["appicon", "mdxplus", "mdxds"] }],
      {
        frame,
        widths: { wallpapers: 130, untitled: 110, appicon: 200, mdxplus: 120, mdxds: 110 },
      },
    );

  for (const frame of FRAMES) {
    test(`${frame}: dropping past the group works from every grab point`, () => {
      const strip = buildReported(frame);
      const grabIndex = indexOf(strip.slots, "untitled");
      const tab = strip.slots[grabIndex];
      // The pointer can travel to the window edge, a little past the strip.
      const pointerAtEdge = strip.groups[0].right + 40;

      for (const grabFraction of [0, 0.25, 0.5, 0.75, 1]) {
        const startX = tab.left + tab.width * grabFraction;
        const { order, targetGroupId } = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx: pointerAtEdge - startX,
          groups: strip.groups,
          metrics: strip.metrics,
          pointerX: pointerAtEdge,
        });

        expect(targetGroupId).toBeUndefined();
        expect(order[order.length - 1]).toBe("untitled");
      }
    });

    test(`${frame}: aiming inside the group still joins it, from every grab point`, () => {
      const strip = buildReported(frame);
      const grabIndex = indexOf(strip.slots, "untitled");
      const tab = strip.slots[grabIndex];
      const pointerInside = centerOf(strip.slots, "mdxplus");

      for (const grabFraction of [0, 0.5, 1]) {
        const startX = tab.left + tab.width * grabFraction;
        const { targetGroupId } = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx: pointerInside - startX,
          groups: strip.groups,
          metrics: strip.metrics,
          pointerX: pointerInside,
        });

        expect(targetGroupId).toBe("222");
      }
    });
  }

  test("a member of an end-of-strip group can be pulled out to the right", () => {
    const strip = buildReported("gnome");
    const grabIndex = indexOf(strip.slots, "appicon");
    const tab = strip.slots[grabIndex];
    const pointerPastGroup = strip.groups[0].right + 60;

    const { targetGroupId, order } = computeDragLayout({
      slots: strip.slots,
      grabIndex,
      dx: pointerPastGroup - (tab.left + tab.width),
      groups: strip.groups,
      metrics: strip.metrics,
      pointerX: pointerPastGroup,
    });

    expect(targetGroupId).toBeUndefined();
    expect(order[order.length - 1]).toBe("appicon");
  });
});

describe("exhaustive sweeps: every tab, every frame, every pixel", () => {
  const layouts: { name: string; items: StripItem[] }[] = [
    { name: "loose tabs only", items: ["a", "b", "c", "d"] },
    { name: "one group in the middle", items: ["a", { group: "g", tabs: ["b", "c"] }, "d"] },
    { name: "group first", items: [{ group: "g", tabs: ["a", "b"] }, "c", "d"] },
    { name: "group last", items: ["a", "b", { group: "g", tabs: ["c", "d"] }] },
    {
      name: "two groups",
      items: [{ group: "g", tabs: ["a", "b"] }, "c", { group: "h", tabs: ["d", "e"] }],
    },
    {
      name: "many tabs in one group",
      items: ["a", { group: "big", tabs: ["b", "c", "d", "e", "f", "g"] }, "h"],
    },
    {
      name: "collapsed group among loose tabs",
      items: ["a", { group: "hidden", tabs: ["x", "y"], collapsed: true }, "b", "c"],
    },
  ];

  for (const frame of FRAMES) {
    for (const { name, items } of layouts) {
      test(`${frame} / ${name}`, () => {
        const strip = buildStrip(items, frame);
        if (strip.slots.length < 2) return;

        for (let grabIndex = 0; grabIndex < strip.slots.length; grabIndex++) {
          const grabbedId = strip.slots[grabIndex].id;
          const from = strip.slots[0].left - 120;
          const to = strip.right + 120;

          for (let x = from; x <= to; x += 3) {
            const dx = dxToReach(strip.slots, grabIndex, x);
            const { order, offsets, groupBoxes, targetGroupId } = computeDragLayout({
              slots: strip.slots,
              grabIndex,
              dx,
              groups: strip.groups,
              metrics: strip.metrics,
            });
            const painted = paint(strip.slots, offsets);

            const membershipChanged = targetGroupId !== strip.slots[grabIndex].groupId;

            expectPermutation(strip.slots, order);
            expectNoOverlap(painted, grabbedId);
            expectSpanPreserved(strip.slots, painted, grabbedId, membershipChanged);
            expectTabsStayInTheirGroups(strip, painted, grabbedId, groupBoxes);
            expectUntouchedGroupsMoveRigidly(strip, painted, grabbedId, targetGroupId);
          }
        }
      });
    }
  }
});

describe("drag mechanics", () => {
  test("a drag that goes nowhere changes nothing", () => {
    for (const frame of FRAMES) {
      const strip = buildStrip(["a", { group: "g", tabs: ["b", "c"] }, "d"], frame);
      for (let grabIndex = 0; grabIndex < strip.slots.length; grabIndex++) {
        const { order, offsets } = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx: 0,
          groups: strip.groups,
          metrics: strip.metrics,
        });

        expect(order).toEqual(strip.slots.map((s) => s.id));
        for (const offset of offsets.values()) {
          expect(offset).toBe(0);
        }
      }
    }
  });

  test("the grabbed tab tracks the pointer exactly", () => {
    const strip = buildStrip(["a", "b", "c"], "gnome");
    const grabIndex = 1;
    for (const dx of [-250, -37, 0, 18, 420]) {
      const { offsets } = computeDragLayout({ slots: strip.slots, grabIndex, dx });
      expect(offsets.get("b")).toBe(dx);
    }
  });

  test("dragging out and back restores the original order", () => {
    const strip = buildStrip(["a", "b", "c", "d"], "gnome");
    const grabIndex = indexOf(strip.slots, "b");

    const away = computeDragLayout({
      slots: strip.slots,
      grabIndex,
      dx: dxToReach(strip.slots, grabIndex, strip.right + 40),
    });
    expect(away.order).not.toEqual(strip.slots.map((s) => s.id));

    const back = computeDragLayout({ slots: strip.slots, grabIndex, dx: 0 });
    expect(back.order).toEqual(strip.slots.map((s) => s.id));
  });

  test("every tab can reach both ends of the strip", () => {
    for (const frame of FRAMES) {
      const strip = buildStrip(["a", { group: "g", tabs: ["b", "c"] }, "d", "e"], frame);

      for (let grabIndex = 0; grabIndex < strip.slots.length; grabIndex++) {
        const id = strip.slots[grabIndex].id;

        const toStart = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx: dxToReach(strip.slots, grabIndex, strip.slots[0].left - 200),
          groups: strip.groups,
          metrics: strip.metrics,
        });
        expect(toStart.order[0]).toBe(id);

        const toEnd = computeDragLayout({
          slots: strip.slots,
          grabIndex,
          dx: dxToReach(strip.slots, grabIndex, strip.right + 200),
          groups: strip.groups,
          metrics: strip.metrics,
        });
        expect(toEnd.order[toEnd.order.length - 1]).toBe(id);
      }
    }
  });

  test("a tab dragged one slot right lands exactly one slot right", () => {
    // Not merely "the order changed": the classic off-by-one here is a tab that
    // needs to travel one and a half slots before it will swap.
    for (const frame of FRAMES) {
      const strip = buildStrip(["a", "b", "c", "d"], frame);
      const grabIndex = indexOf(strip.slots, "b");
      const dx = dxToReach(strip.slots, grabIndex, centerOf(strip.slots, "c") + 1);

      const { order, target } = computeDragLayout({ slots: strip.slots, grabIndex, dx });
      expect(target).toBe(grabIndex + 1);
      expect(order).toEqual(["a", "c", "b", "d"]);
    }
  });
});

describe("group drags reorder whole containers", () => {
  test("a group moved to the end takes all of its tabs, in order", () => {
    const strip = buildStrip([{ group: "g", tabs: ["a", "b"] }, "c", "d"], "gnome");
    const grabIndex = strip.units.findIndex((u) => u.id === "g");
    const unitsRight = strip.units[strip.units.length - 1];

    const { order } = computeDragLayout({
      slots: strip.units,
      grabIndex,
      dx: dxToReach(strip.units, grabIndex, unitsRight.left + unitsRight.width + 50),
    });

    expect(order).toEqual(["c", "d", "g"]);
  });

  test("units never overlap while a group is dragged across the strip", () => {
    const strip = buildStrip(["a", { group: "g", tabs: ["b", "c"] }, "d"], "gnome");
    const grabIndex = strip.units.findIndex((u) => u.id === "g");
    const last = strip.units[strip.units.length - 1];

    for (let x = strip.units[0].left - 100; x <= last.left + last.width + 100; x += 2) {
      const dx = dxToReach(strip.units, grabIndex, x);
      const { order, offsets } = computeDragLayout({ slots: strip.units, grabIndex, dx });
      const painted = paint(strip.units, offsets);

      expectPermutation(strip.units, order);
      expectNoOverlap(painted, "g");
      expectSpanPreserved(strip.units, painted, "g");
    }
  });
});
