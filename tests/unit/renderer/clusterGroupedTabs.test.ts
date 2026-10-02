import { describe, expect, test } from "bun:test";
import { clusterGroupedTabs } from "../../../src/utils/Common/tabCluster";

describe("clusterGroupedTabs", () => {
  test("clusters scattered members of the same group together", () => {
    const input: any[] = [
      { id: 1, title: "Tab 1", groupId: undefined },
      { id: 2, title: "Tab 2", groupId: "group-a" },
      { id: 3, title: "Tab 3", groupId: undefined },
      { id: 4, title: "Tab 4", groupId: "group-a" },
    ];

    const result = clusterGroupedTabs(input);

    expect(result.map((t) => t.id)).toEqual([1, 2, 4, 3]);
    expect(result[1].groupId).toBe("group-a");
    expect(result[2].groupId).toBe("group-a");
  });

  test("preserves position of groups relative to ungrouped tabs", () => {
    const input: any[] = [
      { id: 1, title: "Tab 1", groupId: undefined },
      { id: 2, title: "Tab 2", groupId: "group-a" },
      { id: 3, title: "Tab 3", groupId: "group-b" },
      { id: 4, title: "Tab 4", groupId: undefined },
    ];

    const result = clusterGroupedTabs(input);

    expect(result.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  test("leaves an already-clustered list unchanged", () => {
    const input: any[] = [
      { id: 10, title: "Tab 10", groupId: "g1" },
      { id: 20, title: "Tab 20", groupId: "g1" },
      { id: 30, title: "Tab 30", groupId: undefined },
      { id: 40, title: "Tab 40", groupId: "g2" },
    ];

    const result = clusterGroupedTabs(input);

    expect(result.map((t) => t.id)).toEqual([10, 20, 30, 40]);
  });
});
