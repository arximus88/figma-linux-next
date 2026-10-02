let groupList = $state<Types.TabGroup[]>([]);

function set(value: Types.TabGroup[]) {
  groupList = [...value].sort((a, b) => a.order - b.order);
}

function clear() {
  groupList = [];
}

function getGroup(id: string | undefined) {
  if (!id) return undefined;
  return groupList.find((g) => g.id === id);
}

/** Optimistic local update — the main process is told separately via setTabGroupCollapsed. */
function setCollapsedLocal(id: string, collapsed: boolean) {
  groupList = groupList.map((g) => (g.id === id ? { ...g, collapsed } : g));
}

export const tabGroups = {
  get value() {
    return groupList;
  },
  set,
  clear,
  getGroup,
  setCollapsedLocal,
};
