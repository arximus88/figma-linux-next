import { NEW_FILE_TAB_TITLE } from "Const";
import { currentTab, tabs, newFileVisible, communityTabVisible } from "../store";

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
  console.log("onClickNewProject");
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
