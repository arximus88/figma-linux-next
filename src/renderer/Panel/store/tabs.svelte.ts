let tabList = $state<Types.TabFront[]>([]);

function addTab(data: Types.AddTabProps) {
  tabList = [
    ...tabList,
    {
      id: data.id,
      title: data.title ?? "Figma",
      url: data.url,
      moves: false,
      order: data.order ?? tabList.length + 1,
      focused: data.focused,
      isUsingMicrophone: false,
      isInVoiceCall: false,
      loading: true,
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
  getTab,
  getTabByTitle,
};
