import { NEW_FILE_TAB_TITLE } from "Const";
import { applyLayoutSettings, newFileTabOrder } from "./Components/utils";

import {
  currentTab,
  tabs,
  tabGroups,
  isMenuOpen,
  panelZoom,
  newFileVisible,
  communityTabVisible,
  windowControls,
} from "./store";

/**
 * Keeps grouped tabs clustered together and pushed ahead of ungrouped ones,
 * ordered by each group's creation order — otherwise a tab added to a group
 * whose other members sit elsewhere in the strip would render as a second,
 * identically-labeled group header instead of joining the existing one.
 * Re-run on every group membership/list change (setTabGroup, tabGroupsChanged).
 */
function resortGroupsToFront() {
  const groupOrder = new Map(tabGroups.value.map((g, index) => [g.id, index]));
  const newFileOrder = newFileTabOrder();
  const UNGROUPED = Number.MAX_SAFE_INTEGER;

  const next = tabs.value
    .map((tab, index) => ({ tab, index }))
    .sort((a, b) => {
      const ga = a.tab.groupId ? (groupOrder.get(a.tab.groupId) ?? UNGROUPED) : UNGROUPED;
      const gb = b.tab.groupId ? (groupOrder.get(b.tab.groupId) ?? UNGROUPED) : UNGROUPED;
      // Same group (or both ungrouped) — preserve their existing relative order.
      return ga !== gb ? ga - gb : a.index - b.index;
    })
    .map(({ tab }, index) => ({
      ...tab,
      order: tab.title === NEW_FILE_TAB_TITLE ? newFileOrder : index + 1,
    }));

  tabs.set(next);
  window.figmaApi.send("reorderTabs", $state.snapshot(next));
}

export function initIpc() {
  window.figmaApi.send("frontReady");

  window.figmaApi.on("closeAllTabs", () => {
    tabs.set([]);
    tabGroups.clear();
  });
  window.figmaApi.on("didTabAdd", (data: any) => {
    tabs.addTab({
      id: data.id,
      url: data.url,
      title: data.title,
      focused: data.focused,
      order: data.title === NEW_FILE_TAB_TITLE ? newFileTabOrder() : undefined,
      editorType: data.editorType,
      loading: data.loading,
      groupId: data.groupId,
    });

    if (data.focused) {
      currentTab.set(data.id);
    }

    if (data.title === NEW_FILE_TAB_TITLE) {
      currentTab.set(data.id);
      window.figmaApi.send("setTabFocus", data.id);
    }
  });
  window.figmaApi.on("setTabType", (data: any) => {
    tabs.updateTab({
      id: data.id,
      editorType: data.editorType,
      isLibrary: data.isLibrary,
    });
  });
  window.figmaApi.on("setTitle", (data: any) => {
    // Figma fires these as transient titles while the new-file picker is loading;
    // we keep showing the skeleton until a real document title arrives.
    if (data.title === "New Tab" || data.title === "Recent Files") {
      return;
    }

    tabs.updateTab({ id: data.id, title: data.title });
  });
  window.figmaApi.on("tabWasClosed", (tabId: number) => {
    tabs.deleteTab(tabId);
  });
  window.figmaApi.on("focusTab", (tabId: any) => {
    currentTab.set(tabId);
  });
  window.figmaApi.on("newFileBtnVisible", (visible: boolean) => {
    newFileVisible.set(visible);
  });
  window.figmaApi.on("setUsingMicrophone", (data: any) => {
    tabs.updateTab({ id: data.id, isUsingMicrophone: data.isUsingMicrophone });
  });
  window.figmaApi.on("setIsInVoiceCall", (data: any) => {
    tabs.updateTab({ id: data.id, isInVoiceCall: data.isInVoiceCall });
  });

  window.figmaApi.on("isMainMenuOpen", (isOpen: boolean) => {
    isMenuOpen.set(isOpen);
  });
  window.figmaApi.on("setPanelScale", (scale: number) => {
    panelZoom.set(scale);
  });
  window.figmaApi.on("loadSettings", (settings: Types.SettingsInterface) => {
    panelZoom.set(settings.ui.scalePanel);
    windowControls.setHideMinMax(!!settings.app?.hideWindowMinMaxButtons);
    applyLayoutSettings(settings);
  });
  window.figmaApi.on("openCommunity", () => {
    communityTabVisible.set(true);
    currentTab.set("communityTab");
  });
  window.figmaApi.on("communityTabWasClose", () => {
    communityTabVisible.set(false);
    currentTab.set("mainTab");
  });
  window.figmaApi.on("setLoading", (tabId: number, loading: boolean) => {
    tabs.updateTab({ id: tabId, loading });
  });

  window.figmaApi.on("tabGroupsChanged", (groups: Types.TabGroup[]) => {
    tabGroups.set(groups);
    resortGroupsToFront();
  });
  window.figmaApi.on("setTabGroup", (data: any) => {
    tabs.updateTab({ id: data.id, groupId: data.groupId });
    resortGroupsToFront();
  });
  window.figmaApi.on("promptNewTabGroup", (tabId: number) => {
    tabGroups.openPrompt(tabId);
  });
}
