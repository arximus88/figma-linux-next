import { NEW_FILE_TAB_TITLE } from "Const";
import { applyLayoutSettings, newFileTabOrder, clusterGroupedTabs } from "./Components/utils";

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
 * Keeps grouped tabs clustered together with their respective group,
 * preserving each group's position relative to other tabs.
 */
function resortGroupsToFront() {
  const next = clusterGroupedTabs(tabs.value);
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
      order: data.groupId
        ? undefined
        : data.title === NEW_FILE_TAB_TITLE
          ? newFileTabOrder()
          : undefined,
      editorType: data.editorType,
      loading: data.loading,
      groupId: data.groupId,
    });

    if (data.groupId) {
      resortGroupsToFront();
    }

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
  window.figmaApi.on("setTabDiscarded", (tabId: number, discarded: boolean) => {
    tabs.updateTab({ id: tabId, discarded });
  });

  window.figmaApi.on("tabGroupsChanged", (groups: Types.TabGroup[]) => {
    tabGroups.set(groups);
  });
  window.figmaApi.on("setTabGroup", (data: any) => {
    tabs.updateTab({ id: data.id, groupId: data.groupId });
    resortGroupsToFront();
  });
  // Main asks for the triggering tab's on-screen rect before it shows the
  // "New Group with This Tab" popover — same hand-off tabHover.ts uses for
  // the hover card (see Main/Ui/TabGroupPromptView).
  window.figmaApi.on("promptNewTabGroup", (tabId: number) => {
    const wrapper = document.querySelector<HTMLElement>(`[data-tab-id="${tabId}"]`);
    if (!wrapper) return;
    const r = wrapper.getBoundingClientRect();
    window.figmaApi.send("tabGroupPromptAnchor", tabId, { left: r.left, width: r.width });
  });
  // Same hand-off for "Edit Group…", anchored on the group's chip so the
  // popover opens right under the thing it edits.
  window.figmaApi.on("promptEditTabGroup", (groupId: string) => {
    const container = document.querySelector<HTMLElement>(
      `[data-group-id="${CSS.escape(groupId)}"]`,
    );
    const chip = container?.querySelector<HTMLElement>(".tab-group-header") ?? container;
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    window.figmaApi.send("tabGroupEditAnchor", groupId, { left: r.left, width: r.width });
  });
}
