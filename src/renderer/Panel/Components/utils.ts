import { NEW_FILE_TAB_TITLE } from "Const";
import { currentTab, tabs, newFileVisible, communityTabVisible, layout } from "../store";

/**
 * Where the New file tab is pinned in the strip: first when the "+" lives in
 * the left corner, last when it follows the tabs — the tab should open where
 * the button that created it was.
 */
export const newFileTabOrder = () => (layout.newTabAfterTabs ? Number.MAX_SAFE_INTEGER : 0);

/** Apply the panel-layout part of the settings (boot and every Settings close). */
export function applyLayoutSettings(settings: Types.SettingsInterface | undefined) {
  layout.setNewTabAfterTabs(!!settings?.app?.newTabButtonAfterTabs);
  layout.setTabHoverPreviews(settings?.app?.tabHoverPreviews ?? true);
  tabs.repinNewFileTab(newFileTabOrder());
}

export function closeNewFileTab() {
  const tab = tabs.getTabByTitle(NEW_FILE_TAB_TITLE);

  if (tab) {
    tabs.deleteTab(tab.id);
    window.figmaApi.send("closeTab", tab.id);
  }
}

export function onClickHome(event: MouseEvent) {
  const mouseButton = event.button;

  switch (mouseButton) {
    // left mouse button
    case 0: {
      window.figmaApi.send("setFocusToMainTab");
      currentTab.set("mainTab");
      newFileVisible.set(true);

      closeNewFileTab();

      break;
    }
    // right mouse button
    case 2: {
      window.figmaApi.send("openMainTabMenu");
      break;
    }
  }
}

export function onClickCommunity(event: MouseEvent) {
  const mouseButton = event.button;

  switch (mouseButton) {
    // left mouse button
    case 0: {
      window.figmaApi.send("setFocusToCommunityTab");
      currentTab.set("communityTab");
      newFileVisible.set(true);

      closeNewFileTab();

      break;
    }
    // wheel mouse button
    case 1: {
      communityTabVisible.set(false);
      window.figmaApi.send("closeCommunityTab");
      break;
    }
    // right mouse button
    case 2: {
      window.figmaApi.send("openCommunityTabMenu");
      break;
    }
  }
}
export function onClickNewProject() {
  window.figmaApi.send("newProject");
  newFileVisible.set(false);
}

export function closeTab(id: number) {
  const tab = tabs.getTabByTitle(NEW_FILE_TAB_TITLE);

  if (tab && tab.id === id) {
    newFileVisible.set(true);
  }

  tabs.deleteTab(id);
  window.figmaApi.send("closeTab", id);
}

export function tabFocus(id: number) {
  const tab = tabs.getTab(id);

  if (tab.title !== NEW_FILE_TAB_TITLE) {
    currentTab.set(id);
    window.figmaApi.send("setTabFocus", id);

    const newFileTab = tabs.getTabByTitle(NEW_FILE_TAB_TITLE);
    if (newFileTab) {
      tabs.deleteTab(newFileTab.id);
      window.figmaApi.send("closeTab", newFileTab.id);
      newFileVisible.set(true);
    }
  }
}
