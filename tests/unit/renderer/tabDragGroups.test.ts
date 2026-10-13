/**
 * Tab drags across several groups, with realistic tab widths, and over
 * sequences of drags rather than one in isolation.
 *
 * The single-drag tests in tabDragLayout.test.ts answer "is this frame of the
 * drag sane?". These answer the two questions that only show up in use:
 *   - can a tab actually be moved *between* groups, in both directions, with
 *     more than one group in the strip?
 *   - does the strip still behave after a dozen drags, or does it accumulate
 *     drift until tabs stop moving?
 *
 * Widths matter here. Real tab titles range from "222" to "App Icon Template -
 * iOS, iPadOS…", and several bugs in this area only appeared at particular
 * width ratios — a tab wide enough that its center sits past its neighbour's
 * box, or narrow enough that two of them fit inside one drag step.
 */

import { describe, expect, test } from "bun:test";
import {
  computeDragLayout,
  type DragSlot,
} from "../../../src/renderer/Panel/Components/tabDragLayout";
import {
  buildStrip,
  centerOf,
  type FrameName,
  indexOf,
  paint,
  type StripItem,
} from "./tabStripHarness";
import {
  expectContainersKeepTheirSize,
  expectNoOverlap,
  expectPermutation,
  expectTabsStayInTheirGroups,
  expectUntouchedGroupsMoveRigidly,
} from "./tabStripInvariants";

const FRAMES: FrameName[] = ["gnome", "kde", "windows"];

/** Widths of real tab titles, from the narrowest badge to a truncated long name. */
const WIDTHS = {
  tiny: 64, // "222"
  short: 96, // "mdx-ds"
  medium: 150, // "Wallpapers"
  long: 220, // "App Icon Template - iOS, iPadOS…"
} as const;

/** Drag `tabId` until the pointer sits at `pointerX`, and report the result. */
function dragTo(
  strip: ReturnType<typeof buildStrip>,
  tabId: string,
  pointerX: number,
  grabFraction = 0.5,
) {
  const grabIndex = indexOf(strip.slots, tabId);
  const tab = strip.slots[grabIndex];
  const startX = tab.left + tab.width * grabFraction;

  return {
    grabIndex,
    ...computeDragLayout({
      slots: strip.slots,
      grabIndex,
      dx: pointerX - startX,
      groups: strip.groups,
      metrics: strip.metrics,
      pointerX,
    }),
  };
}

describe("moving tabs between two groups", () => {
  const layout: StripItem[] = [
    { group: "left", tabs: ["l1", "l2"] },
    "loose",
    { group: "right", tabs: ["r1", "r2"] },
  ];
  const widths = {
    l1: WIDTHS.medium,
    l2: WIDTHS.short,
    loose: WIDTHS.long,
    r1: WIDTHS.tiny,
    r2: WIDTHS.medium,
  };

  for (const frame of FRAMES) {
    test(`${frame}: a tab moves from the left group to the right one`, () => {
      const strip = buildStrip(layout, { frame, widths });
      const { targetGroupId, order } = dragTo(strip, "l1", centerOf(strip.slots, "r1"));

      expect(targetGroupId).toBe("right");
      // It lands among the right group's members, not before the loose tab.
      const placed = order.indexOf("l1");
      expect(placed).toBeGreaterThan(order.indexOf("loose"));
    });

    test(`${frame}: and back again, right group to left`, () => {
      const strip = buildStrip(layout, { frame, widths });
      const { targetGroupId, order } = dragTo(strip, "r2", centerOf(strip.slots, "l2"));

      expect(targetGroupId).toBe("left");
      expect(order.indexOf("r2")).toBeLessThan(order.indexOf("loose"));
    });

    test(`${frame}: a loose tab between two groups can join either`, () => {
      const strip = buildStrip(layout, { frame, widths });

      expect(dragTo(strip, "loose", centerOf(strip.slots, "l2")).targetGroupId).toBe("left");
      expect(dragTo(strip, "loose", centerOf(strip.slots, "r1")).targetGroupId).toBe("right");
    });

    test(`${frame}: the gap between two groups is still "no group"`, () => {
      const strip = buildStrip(layout, { frame, widths });
      // Aim at the loose tab sitting between the groups.
      const { targetGroupId } = dragTo(strip, "l1", centerOf(strip.slots, "loose"));
      expect(targetGroupId).toBeUndefined();
    });
  }

  test("a tab passing over a group it isn't joining never splits it", () => {
    const strip = buildStrip(layout, { frame: "gnome", widths });
    const grabIndex = indexOf(strip.slots, "l1");
    const tab = strip.slots[grabIndex];

    for (let pointerX = strip.slots[0].left - 60; pointerX <= strip.right + 60; pointerX += 2) {
      const r = computeDragLayout({
        slots: strip.slots,
        grabIndex,
        dx: pointerX - (tab.left + tab.width / 2),
        groups: strip.groups,
        metrics: strip.metrics,
        pointerX,
      });

      // In the drop order, each group's members stay contiguous. Membership is
      // taken as it will be *after* the drop, so the dragged tab counts towards
      // the group it is joining and against the one it is leaving.
      for (const groupId of ["left", "right"]) {
        const positions = r.order
          .map((id, i) => ({ id, i }))
          .filter(({ id }) => {
            const settled =
              id === "l1" ? r.targetGroupId : strip.slots.find((s) => s.id === id)?.groupId;
            return settled === groupId;
          })
          .map(({ i }) => i);
        if (positions.length < 2) continue;
        expect(Math.max(...positions) - Math.min(...positions)).toBe(positions.length - 1);
      }
    }
  });
});

describe("three groups in one strip", () => {
  const layout: StripItem[] = [
    { group: "a", tabs: ["a1", "a2"] },
    { group: "b", tabs: ["b1", "b2", "b3"] },
    { group: "c", tabs: ["c1"] },
  ];
  const widths = {
    a1: WIDTHS.tiny,
    a2: WIDTHS.long,
    b1: WIDTHS.medium,
    b2: WIDTHS.short,
    b3: WIDTHS.tiny,
    c1: WIDTHS.long,
  };

  for (const frame of FRAMES) {
    test(`${frame}: every tab can reach every group`, () => {
      const strip = buildStrip(layout, { frame, widths });

      for (const tabId of ["a1", "a2", "b1", "b2", "b3", "c1"]) {
        for (const groupId of ["a", "b", "c"]) {
          const box = strip.groups.find((g) => g.groupId === groupId)!;
          const aim = (box.left + box.right) / 2;
          expect(dragTo(strip, tabId, aim).targetGroupId).toBe(groupId);
        }
      }
    });

    test(`${frame}: sweeping any tab across all three groups stays sane`, () => {
      const strip = buildStrip(layout, { frame, widths });

      for (const tabId of ["a1", "b2", "c1"]) {
        const grabIndex = indexOf(strip.slots, tabId);
        const tab = strip.slots[grabIndex];

        for (let pointerX = strip.slots[0].left - 80; pointerX <= strip.right + 80; pointerX += 3) {
          const r = computeDragLayout({
            slots: strip.slots,
            grabIndex,
            dx: pointerX - (tab.left + tab.width / 2),
            groups: strip.groups,
            metrics: strip.metrics,
            pointerX,
          });
          const painted = paint(strip.slots, r.offsets);

          expectPermutation(strip.slots, r.order);
          expectNoOverlap(painted, tabId);
          expectContainersKeepTheirSize(strip, r.groupBoxes);
          expectTabsStayInTheirGroups(strip, painted, tabId, r.groupBoxes);
          expectUntouchedGroupsMoveRigidly(strip, painted, tabId, r.targetGroupId);
        }
      }
    });
  }
});

describe("tab titles of every length", () => {
  const mixes: { name: string; widths: Record<string, number> }[] = [
    {
      name: "all tiny",
      widths: { t1: WIDTHS.tiny, t2: WIDTHS.tiny, t3: WIDTHS.tiny, t4: WIDTHS.tiny },
    },
    {
      name: "all long",
      widths: { t1: WIDTHS.long, t2: WIDTHS.long, t3: WIDTHS.long, t4: WIDTHS.long },
    },
    {
      name: "tiny beside long",
      widths: { t1: WIDTHS.tiny, t2: WIDTHS.long, t3: WIDTHS.tiny, t4: WIDTHS.long },
    },
    {
      name: "ascending",
      widths: { t1: WIDTHS.tiny, t2: WIDTHS.short, t3: WIDTHS.medium, t4: WIDTHS.long },
    },
    {
      name: "descending",
      widths: { t1: WIDTHS.long, t2: WIDTHS.medium, t3: WIDTHS.short, t4: WIDTHS.tiny },
    },
  ];

  for (const frame of FRAMES) {
    for (const { name, widths } of mixes) {
      test(`${frame} / ${name}: dragging any tab keeps the strip sane`, () => {
        const strip = buildStrip(["t1", { group: "g", tabs: ["t2", "t3"] }, "t4"], {
          frame,
          widths,
        });

        for (const tabId of ["t1", "t2", "t3", "t4"]) {
          const grabIndex = indexOf(strip.slots, tabId);
          const tab = strip.slots[grabIndex];

          for (
            let pointerX = strip.slots[0].left - 60;
            pointerX <= strip.right + 60;
            pointerX += 2
          ) {
            const r = computeDragLayout({
              slots: strip.slots,
              grabIndex,
              dx: pointerX - (tab.left + tab.width / 2),
              groups: strip.groups,
              metrics: strip.metrics,
              pointerX,
            });
            const painted = paint(strip.slots, r.offsets);

            expectNoOverlap(painted, tabId);
            expectContainersKeepTheirSize(strip, r.groupBoxes);
            expectTabsStayInTheirGroups(strip, painted, tabId, r.groupBoxes);
          }
        }
      });

      test(`${frame} / ${name}: a narrow tab can still be dropped at either end`, () => {
        const strip = buildStrip(["t1", { group: "g", tabs: ["t2", "t3"] }, "t4"], {
          frame,
          widths,
        });

        for (const tabId of ["t1", "t4"]) {
          const toStart = dragTo(strip, tabId, strip.slots[0].left - 40);
          expect(toStart.order[0]).toBe(tabId);

          const toEnd = dragTo(strip, tabId, strip.right + 40);
          expect(toEnd.order[toEnd.order.length - 1]).toBe(tabId);
        }
      });
    }
  }
});

/**
 * The "it stops working after a while" report. One drag in isolation can look
 * perfect while a sequence of them drifts, because each drag is measured from
 * the strip the previous one left behind.
 *
 * `applyDrop` is the model of what the app does on drop: the store takes the
 * new order and membership, and Svelte re-renders the strip from scratch. If
 * the geometry were carrying hidden state between drags, relaying it here would
 * not reproduce the boxes and the invariants would start failing partway
 * through the sequence.
 */
describe("repeated drags do not accumulate drift", () => {
  type Placement = { id: string; groupId?: string };

  function applyDrop(
    strip: ReturnType<typeof buildStrip>,
    order: (number | string)[],
    grabbedId: string,
    targetGroupId: string | undefined,
    widths: Record<string, number>,
    frame: FrameName,
  ) {
    const placements: Placement[] = order.map((id) => ({
      id: String(id),
      groupId: id === grabbedId ? targetGroupId : strip.slots.find((s) => s.id === id)?.groupId,
    }));

    // Rebuild the declarative strip: consecutive same-group tabs form a group.
    const items: StripItem[] = [];
    for (let i = 0; i < placements.length; ) {
      const { groupId } = placements[i];
      if (!groupId) {
        items.push(placements[i].id);
        i++;
        continue;
      }
      const tabs: string[] = [];
      while (i < placements.length && placements[i].groupId === groupId) {
        tabs.push(placements[i].id);
        i++;
      }
      items.push({ group: groupId, tabs });
    }
    return buildStrip(items, { frame, widths });
  }

  for (const frame of FRAMES) {
    test(`${frame}: twenty drags in a row, each one still correct`, () => {
      const widths = {
        one: WIDTHS.medium,
        two: WIDTHS.tiny,
        three: WIDTHS.long,
        four: WIDTHS.short,
        five: WIDTHS.medium,
      };
      let strip = buildStrip(["one", "two", { group: "g", tabs: ["three", "four"] }, "five"], {
        frame,
        widths,
      });

      const ids = ["one", "two", "three", "four", "five"];

      for (let step = 0; step < 20; step++) {
        const tabId = ids[step % ids.length];
        if (!strip.slots.some((s) => s.id === tabId)) continue;

        // Alternate between aiming at the far ends and into the group.
        const aim =
          step % 3 === 0
            ? strip.right + 30
            : step % 3 === 1
              ? strip.slots[0].left - 30
              : (strip.groups[0]?.left ?? strip.slots[0].left) +
                (strip.groups[0] ? (strip.groups[0].right - strip.groups[0].left) / 2 : 0);

        const r = dragTo(strip, tabId, aim);
        const painted = paint(strip.slots, r.offsets);

        expectPermutation(strip.slots, r.order);
        expectNoOverlap(painted, tabId);
        expectContainersKeepTheirSize(strip, r.groupBoxes);
        expectTabsStayInTheirGroups(strip, painted, tabId, r.groupBoxes);

        strip = applyDrop(strip, r.order, tabId, r.targetGroupId, widths, frame);

        // The strip must still contain every tab, exactly once.
        expect(strip.slots.map((s) => String(s.id)).sort()).toEqual([...ids].sort());
      }
    });

    test(`${frame}: a tab stays movable after repeated round trips`, () => {
      const widths = { a: WIDTHS.medium, b: WIDTHS.tiny, c: WIDTHS.long };
      let strip = buildStrip(["a", "b", "c"], { frame, widths });

      for (let round = 0; round < 10; round++) {
        // Send "a" to the end...
        const toEnd = dragTo(strip, "a", strip.right + 30);
        expect(toEnd.order[toEnd.order.length - 1]).toBe("a");
        strip = applyDrop(strip, toEnd.order, "a", undefined, widths, frame);

        // ...and bring it back to the front. If drift were accumulating, this
        // is where a drag would quietly stop having any effect.
        const toStart = dragTo(strip, "a", strip.slots[0].left - 30);
        expect(toStart.order[0]).toBe("a");
        strip = applyDrop(strip, toStart.order, "a", undefined, widths, frame);

        expect(strip.slots.map((s) => String(s.id))).toEqual(["a", "b", "c"]);
      }
    });
  }
});

describe("dragging within a group reorders only that group", () => {
  for (const frame of FRAMES) {
    test(`${frame}: members swap without disturbing anything else`, () => {
      const strip = buildStrip(["before", { group: "g", tabs: ["m1", "m2", "m3"] }, "after"], {
        frame,
        widths: {
          before: WIDTHS.medium,
          m1: WIDTHS.short,
          m2: WIDTHS.long,
          m3: WIDTHS.tiny,
          after: WIDTHS.medium,
        },
      });

      const { order, targetGroupId, offsets, groupBoxes } = dragTo(
        strip,
        "m1",
        centerOf(strip.slots, "m3"),
      );

      expect(targetGroupId).toBe("g");
      expect(order.indexOf("m1")).toBeGreaterThan(order.indexOf("m2"));
      // Tabs outside the group never move for an in-group reorder.
      expect(offsets.get("before")).toBe(0);
      expect(offsets.get("after")).toBe(0);
      expectContainersKeepTheirSize(strip, groupBoxes);
    });

    test(`${frame}: the group container itself does not move`, () => {
      const strip = buildStrip(["before", { group: "g", tabs: ["m1", "m2"] }], { frame });
      const { groupOffsets } = dragTo(strip, "m1", centerOf(strip.slots, "m2"));
      expect(groupOffsets.get("g")).toBe(0);
    });
  }
});

/**
 * What the strip shows *while* a tab is held, as opposed to where it lands.
 *
 * The reported defect: dragging a loose tab through a group opened two holes at
 * once — one where the tab came from, one where the preview wanted to insert
 * it — with the tab floating in between. A pending group change re-lays the
 * whole strip on drop, so previewing it is both misleading and impossible to
 * keep consistent; the target-group highlight carries that information instead.
 */
describe("the preview stays still while membership is about to change", () => {
  for (const frame of FRAMES) {
    test(`${frame}: dragging a loose tab through a group moves nothing`, () => {
      const strip = buildStrip(["outside", { group: "g", tabs: ["m1", "m2"] }, "tail"], {
        frame,
        widths: {
          outside: WIDTHS.medium,
          m1: WIDTHS.tiny,
          m2: WIDTHS.long,
          tail: WIDTHS.short,
        },
      });
      const box = strip.groups[0];

      // Sweep right across the group's whole box.
      for (let pointerX = box.left - 10; pointerX <= box.right + 10; pointerX += 2) {
        const r = dragTo(strip, "outside", pointerX);
        if (r.targetGroupId === undefined) continue; // not over the group yet

        expect(r.targetGroupId).toBe("g");
        // Every settled tab is exactly where it was: no gap opens anywhere.
        for (const slot of strip.slots) {
          if (slot.id === "outside") continue;
          expect(r.offsets.get(slot.id)).toBe(0);
        }
        expect(r.groupOffsets.get("g")).toBe(0);
      }
    });

    test(`${frame}: a member being pulled out of its group moves nothing either`, () => {
      const strip = buildStrip(["outside", { group: "g", tabs: ["m1", "m2"] }, "tail"], { frame });
      const r = dragTo(strip, "m1", strip.right + 60);

      expect(r.targetGroupId).toBeUndefined();
      for (const slot of strip.slots) {
        if (slot.id === "m1") continue;
        expect(r.offsets.get(slot.id)).toBe(0);
      }
    });

    test(`${frame}: but a plain reorder still opens a gap`, () => {
      const strip = buildStrip(["a", "b", "c"], { frame });
      const r = dragTo(strip, "a", centerOf(strip.slots, "b") + 1);

      expect(r.targetGroupId).toBeUndefined();
      // "b" slides left to make room — otherwise there is no drag feedback.
      expect(r.offsets.get("b")).not.toBe(0);
      expect(r.order).toEqual(["b", "a", "c"]);
    });

    test(`${frame}: reordering within a group opens a gap inside it`, () => {
      const strip = buildStrip(["a", { group: "g", tabs: ["m1", "m2", "m3"] }], { frame });
      const r = dragTo(strip, "m1", centerOf(strip.slots, "m2") + 1);

      expect(r.targetGroupId).toBe("g");
      expect(r.offsets.get("m2")).not.toBe(0);
      expect(r.offsets.get("a")).toBe(0);
      expectContainersKeepTheirSize(strip, r.groupBoxes);
    });
  }
});

/** Collapsed groups render no tabs, so they are easy to get wrong. */
describe("collapsed groups", () => {
  for (const frame of FRAMES) {
    test(`${frame}: a collapsed group is passed over, never entered`, () => {
      const strip = buildStrip(
        ["a", { group: "hidden", tabs: ["h1", "h2"], collapsed: true }, "b"],
        { frame, widths: { a: WIDTHS.medium, b: WIDTHS.long } },
      );

      // Its tabs aren't rendered, so they aren't slots either.
      expect(strip.slots.map((s) => String(s.id))).toEqual(["a", "b"]);

      const { order } = dragTo(strip, "a", strip.right + 30);
      expect(order).toEqual(["b", "a"]);
    });
  }
});

/** Sanity: the harness itself is not quietly producing overlapping boxes. */
describe("harness self-check", () => {
  for (const frame of FRAMES) {
    test(`${frame}: every built strip has non-overlapping, ordered boxes`, () => {
      const strip = buildStrip(
        ["a", { group: "g", tabs: ["b", "c"] }, "d", { group: "h", tabs: ["e"] }, "f"],
        {
          frame,
          widths: { a: WIDTHS.tiny, b: WIDTHS.long, c: WIDTHS.short, d: WIDTHS.medium },
        },
      );

      const sorted: DragSlot[] = [...strip.slots].sort((x, y) => x.left - y.left);
      expect(sorted.map((s) => s.id)).toEqual(strip.slots.map((s) => s.id));
      expectNoOverlap(strip.slots, "___none___");
    });
  }
});
