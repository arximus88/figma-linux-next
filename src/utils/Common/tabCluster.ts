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
