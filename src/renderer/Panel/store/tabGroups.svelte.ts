let groupList = $state<Types.TabGroup[]>([]);
// Tab that "New Group with This Tab" was clicked for; drives NewTabGroupPrompt.svelte.
let promptTabId = $state<number | null>(null);

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

function openPrompt(tabId: number) {
  promptTabId = tabId;
}

function closePrompt() {
  promptTabId = null;
}

export const tabGroups = {
  get value() {
    return groupList;
  },
  get promptTabId() {
    return promptTabId;
  },
  set,
  clear,
  getGroup,
  setCollapsedLocal,
  openPrompt,
  closePrompt,
};
