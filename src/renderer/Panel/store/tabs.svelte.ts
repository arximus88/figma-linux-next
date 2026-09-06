import { NEW_FILE_TAB_TITLE } from "Const";

let tabList = $state<Types.TabFront[]>([]);

function addTab(data: Types.AddTabProps) {
  tabList = [
    ...tabList,
    {
      id: data.id,
      title: data.title,
      url: data.url,
      editorType: data.editorType,
      isLibrary: data.isLibrary ?? false,
      moves: false,
      order: data.order ?? tabList.length + 1,
      focused: data.focused,
      isUsingMicrophone: false,
      isInVoiceCall: false,
      loading: data.loading ?? true,
    },
  ].sort((a, b) => (a.order > b.order ? 1 : -1));
}

function deleteTab(id: number) {
  tabList = tabList.filter((t) => t.id !== id);
}

function clear() {
  tabList = [];
}

function updateTab(tab: Partial<Types.TabFront> & { id: number }) {
  tabList = tabList
    .map((t) => (t.id === tab.id ? { ...t, ...tab } : t))
    .sort((a, b) => (a.order > b.order ? 1 : -1));
}

/** Move the New file tab to `order` (0 = first, MAX_SAFE_INTEGER = last) when the layout flips. */
function repinNewFileTab(order: number) {
  if (!tabList.some((t) => t.title === NEW_FILE_TAB_TITLE && t.order !== order)) return;
  tabList = tabList
    .map((t) => (t.title === NEW_FILE_TAB_TITLE ? { ...t, order } : t))
    .sort((a, b) => (a.order > b.order ? 1 : -1));
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
