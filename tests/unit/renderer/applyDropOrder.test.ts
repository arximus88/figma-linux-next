/**
 * applyDropOrder — turning a finished drag into the new tab list.
 *
 * This is where a drop silently died: the list was rebuilt by mapping over the
 * *old* array and swapping objects in place, so the dropped sequence survived
 * only in each tab's `order` field, which clusterGroupedTabs then overwrote
 * from the array positions it had been handed. The strip renders the array, so
 * every reorder was thrown away and the tab sprang back to where it started —
 * while group changes kept working, because `groupId` lives on the object and
 * doesn't depend on position.
 *
 * Hence the first assertion of nearly every test here is on the *array order*,
 * never on the `order` field.
 */

import { describe, expect, test } from "bun:test";
import { applyDropOrder } from "../../../src/utils/Common/tabCluster";

interface Tab {
  id: number;
  groupId?: string;
}

const strip = (...tabs: (number | [number, string])[]): Tab[] =>
  tabs.map((t) => (typeof t === "number" ? { id: t } : { id: t[0], groupId: t[1] }));

const ids = (tabs: Tab[]) => tabs.map((t) => t.id);
const groups = (tabs: Tab[]) => tabs.map((t) => t.groupId);

describe("applyDropOrder", () => {
  test("puts the tabs in the dropped sequence", () => {
    const before = strip(1, 2, 3, 4);
    expect(ids(applyDropOrder(before, [3, 1, 4, 2]))).toEqual([3, 1, 4, 2]);
  });

  test("a no-op drop leaves the list untouched", () => {
    const before = strip(1, 2, 3);
    expect(ids(applyDropOrder(before, [1, 2, 3]))).toEqual([1, 2, 3]);
  });

  test("moving one tab to the end moves exactly that tab", () => {
    const before = strip(1, 2, 3, 4);
    expect(ids(applyDropOrder(before, [2, 3, 4, 1]))).toEqual([2, 3, 4, 1]);
  });

  test("keeps every tab, once", () => {
    const before = strip(1, 2, 3, 4, 5);
    const after = applyDropOrder(before, [5, 4, 3, 2, 1]);
    expect(ids(after).slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test("applies a new group to the dragged tab only", () => {
    const before = strip(1, [2, "g"], [3, "g"], 4);
    const after = applyDropOrder(before, [2, 3, 1, 4], new Map([[1, "g"]]));

    expect(groups(after.filter((t) => t.id === 1))).toEqual(["g"]);
    expect(after.find((t) => t.id === 4)?.groupId).toBeUndefined();
  });

  test("applies leaving a group", () => {
    const before = strip([1, "g"], [2, "g"], 3);
    const after = applyDropOrder(before, [2, 3, 1], new Map([[1, undefined]]));

    expect(after.find((t) => t.id === 1)?.groupId).toBeUndefined();
    expect(after.find((t) => t.id === 2)?.groupId).toBe("g");
    expect(ids(after)).toEqual([2, 3, 1]);
  });

  test("an explicit undefined assignment is honoured, not treated as absent", () => {
    // Map.has() vs a truthiness check: getting this wrong makes "leave the
    // group" a no-op, which is indistinguishable from the drop not working.
    const before = strip([1, "g"], 2);
    const after = applyDropOrder(before, [1, 2], new Map([[1, undefined]]));
    expect(after.find((t) => t.id === 1)?.groupId).toBeUndefined();
  });

  test("keeps a group's members contiguous", () => {
    const before = strip(1, [2, "g"], 3, [4, "g"]);
    const after = applyDropOrder(before, [1, 2, 3, 4]);

    const positions = after
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.groupId === "g")
      .map(({ i }) => i);
    expect(Math.max(...positions) - Math.min(...positions)).toBe(positions.length - 1);
  });

  test("folds collapsed-group members the drag never saw back beside their group", () => {
    // Tabs 2 and 3 are inside a collapsed group: no wrapper in the strip, so
    // the drag reports neither of them.
    const before = strip(1, [2, "hidden"], [3, "hidden"], 4);
    const after = applyDropOrder(before, [4, 1]);

    expect(ids(after).slice().sort()).toEqual([1, 2, 3, 4]);
    const positions = after
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.groupId === "hidden")
      .map(({ i }) => i);
    expect(Math.max(...positions) - Math.min(...positions)).toBe(1);
  });

  test("ignores ids that are no longer in the list", () => {
    // A tab closed under the cursor mid-drag.
    const before = strip(1, 2);
    expect(ids(applyDropOrder(before, [2, 99, 1]))).toEqual([2, 1]);
  });

  test("does not mutate the tabs it was given", () => {
    const before = strip(1, [2, "g"]);
    const snapshot = JSON.stringify(before);
    applyDropOrder(before, [2, 1], new Map([[2, undefined]]));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("survives being applied repeatedly", () => {
    // The drift check: each drop is applied to the list the previous one
    // produced, exactly as the app does.
    let list = strip(1, 2, [3, "g"], [4, "g"], 5);

    for (let round = 0; round < 10; round++) {
      list = applyDropOrder(list, [...ids(list)].reverse());
      expect(ids(list).slice().sort()).toEqual([1, 2, 3, 4, 5]);

      const positions = list
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.groupId === "g")
        .map(({ i }) => i);
      expect(Math.max(...positions) - Math.min(...positions)).toBe(1);
    }
  });

  test("a tab really can be moved past a group and back", () => {
    let list = strip(1, [2, "g"], [3, "g"], 4);

    list = applyDropOrder(list, [2, 3, 4, 1]);
    expect(ids(list)).toEqual([2, 3, 4, 1]);

    list = applyDropOrder(list, [1, 2, 3, 4]);
    expect(ids(list)).toEqual([1, 2, 3, 4]);
  });
});
