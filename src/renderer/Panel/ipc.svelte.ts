import { NEW_FILE_TAB_TITLE } from "Const";

import {
  currentTab,
  tabs,
  isMenuOpen,
  panelZoom,
  newFileVisible,
  communityTabVisible,
  windowControls,
} from "./store";

export function initIpc() {
  window.figmaApi.send("frontReady");

  window.figmaApi.on("closeAllTabs", () => {
    tabs.set([]);
  });
  window.figmaApi.on("didTabAdd", (data: any) => {
    tabs.addTab({
      id: data.id,
      url: data.url,
      title: data.title,
      focused: data.focused,
      order: data.title === NEW_FILE_TAB_TITLE ? 0 : undefined,
      editorType: data.editorType,
      loading: data.loading,
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
}
