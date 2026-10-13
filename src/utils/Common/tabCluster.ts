/**
 * Clusters tabs belonging to the same group together at each group's position
 * in the strip, without forcing groups to the start of the strip.
 */
export function clusterGroupedTabs<T extends { groupId?: string }>(tabList: T[]): T[] {
  const seenGroups = new Map<string, number>();
  const result: T[] = [];

  for (const tab of tabList) {
    if (!tab.groupId) {
      result.push(tab);
      continue;
    }
    if (!seenGroups.has(tab.groupId)) {
      seenGroups.set(tab.groupId, result.length);
      result.push(tab);
    } else {
      let lastIdx = result.length - 1;
      while (lastIdx >= 0 && result[lastIdx].groupId !== tab.groupId) {
        lastIdx--;
      }
      result.splice(lastIdx + 1, 0, tab);
    }
  }

  return result;
}

/**
 * Apply a drag's result to the tab list: the dropped order, the new group
 * membership, and the tabs the drag never saw.
 *
 * Tabs inside a collapsed group have no wrapper in the strip, so they never
 * appear in `orderedIds`. They are appended and left to `clusterGroupedTabs`,
 * which pulls each one back beside the rest of its group.
 *
 * This exists as its own function because getting it wrong is invisible: the
 * caller used to rebuild the list by mapping over the *old* array and swapping
 * objects in place, so the new sequence survived only in each tab's `order`
 * field — which `clusterGroupedTabs` then overwrote from the array positions it
 * was handed. The reorder was silently discarded and the tab sprang back.
 */
export function applyDropOrder<T extends { id: number; groupId?: string }>(
  tabs: T[],
  orderedIds: number[],
  groupAssignments?: Map<number, string | undefined>,
): T[] {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));

  const dropped = orderedIds
    .map((id) => byId.get(id))
    .filter((tab): tab is T => !!tab)
    .map((tab) =>
      groupAssignments?.has(tab.id) ? { ...tab, groupId: groupAssignments.get(tab.id) } : tab,
    );

  const placed = new Set(dropped.map((tab) => tab.id));
  const unseen = tabs.filter((tab) => !placed.has(tab.id));

  return clusterGroupedTabs([...dropped, ...unseen]);
}
