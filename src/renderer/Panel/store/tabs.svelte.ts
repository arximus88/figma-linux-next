import { NEW_FILE_TAB_TITLE } from "Const";
import { clusterGroupedTabs as clusterTabs } from "Utils/Common";

let tabList = $state<Types.TabFront[]>([]);

function maxOrder(): number {
  return tabList.reduce(
    (max, t) => (t.order < Number.MAX_SAFE_INTEGER ? Math.max(max, t.order) : max),
    0,
  );
}

function addTab(data: Types.AddTabProps) {
  const newTab: Types.TabFront = {
    id: data.id,
    title: data.title,
    url: data.url,
    editorType: data.editorType,
    isLibrary: data.isLibrary ?? false,
    order: data.order ?? maxOrder() + 1,
    isUsingMicrophone: false,
    isInVoiceCall: false,
    loading: data.loading ?? true,
    groupId: data.groupId,
  };

  const combined = [...tabList, newTab].sort((a, b) => (a.order > b.order ? 1 : -1));
  const clustered = clusterTabs(combined);
  tabList = clustered.map((tab, index) => ({
    ...tab,
    order: tab.order === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : index + 1,
  }));
}

function deleteTab(id: number) {
  const filtered = tabList.filter((t) => t.id !== id);
  tabList = filtered.map((tab, index) => ({
    ...tab,
    order: tab.order === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : index + 1,
  }));
}

function clear() {
  tabList = [];
}

function updateTab(tab: Partial<Types.TabFront> & { id: number }) {
  const updated = tabList.map((t) => (t.id === tab.id ? { ...t, ...tab } : t));
  if (tab.groupId !== undefined) {
    const clustered = clusterTabs(updated);
    tabList = clustered.map((t, index) => ({
      ...t,
      order: t.order === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : index + 1,
    }));
  } else {
    tabList = updated;
  }
}

/** Move the New file tab to `order` (0 = first, MAX_SAFE_INTEGER = last) when the layout flips. */
function repinNewFileTab(order: number) {
  if (!tabList.some((t) => t.title === NEW_FILE_TAB_TITLE && !t.groupId && t.order !== order))
    return;
  const reordered = tabList
    .map((t) => (t.title === NEW_FILE_TAB_TITLE && !t.groupId ? { ...t, order } : t))
    .sort((a, b) => (a.order > b.order ? 1 : -1));
  const clustered = clusterTabs(reordered);
  tabList = clustered.map((t, index) => ({
    ...t,
    order: t.order === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : index + 1,
  }));
}

function getTab(id: number) {
  return tabList.find((tab) => tab.id === id);
}

function getTabByTitle(title: string) {
  return tabList.find((tab) => tab.title === title);
}

export const tabs = {
  get value() {
    return tabList;
  },
  set(value: Types.TabFront[]) {
    tabList = value;
  },
  addTab,
  deleteTab,
  clear,
  updateTab,
  repinNewFileTab,
  getTab,
  getTabByTitle,
};
