<script lang="ts">
  let { frameStyle = "windows" as Types.FrameStyle } = $props();
  import { tabs, currentTab } from "../store";
  import { closeTab, tabFocus } from "./utils";
  import List from "./List.svelte";
  import { NEW_FILE_TAB_TITLE } from "../../../constants/other";
  import { getFrameConfig } from "Utils/Render/frameConfig";

  const config = $derived(getFrameConfig(frameStyle));

  let currentTabId = $state<number | undefined>();

  let item: HTMLDivElement;

  function wheelHandler(e: WheelEvent) {
    if (e.deltaY > 0) {
      item.scrollLeft += 50;
    } else {
      item.scrollLeft -= 50;
    }
  }
  function dblclickHandler(e: MouseEvent) {
    window.figmaApi.send("windowMaximize");
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function onClickTitle(event: MouseEvent, id: number) {
    switch (event.button) {
      // left mouse button
      case 0: {
        tabFocus(id);
        break;
      }
      // wheel mouse button
      case 1: {
        closeTab(id);
        break;
      }
      // right mouse button
      case 2: {
        window.figmaApi.send("openTabMenu", id);
        break;
      }
    }
  }

  function onClickClose(event: MouseEvent, id: number) {
    closeTab(id);
  }

  function onDndConsider(event: any) {
    tabs.set(event.detail.items);
  }
  function onDndFinalize(event: any) {
    const items = event.detail.items as Types.TabFront[];
    tabs.set(
      items
        .map((tab, index) => ({
          ...tab,
          order: tab.title === NEW_FILE_TAB_TITLE ? 0 : index + 1,
        }))
        .sort((a, b) => (a.order > b.order ? 1 : -1)),
    );
  }

  // Reactive currentTab → currentTabId via $effect (replaces .subscribe())
  $effect(() => {
    const id = currentTab.value;
    if (typeof id === "number") {
      currentTabId = id;
    } else {
      currentTabId = undefined;
    }
  });
</script>

<div role="tablist" tabindex="0" class="panel-tabs" bind:this={item} onwheel={wheelHandler} ondblclick={dblclickHandler}>
  <List
    items={tabs.value}
    {currentTabId}
    {config}
    {onClickTitle}
    {onClickClose}
    {onDndConsider}
    {onDndFinalize}
  />
</div>

<style>
  .panel-tabs {
    display: flex;
    flex-grow: 1;
    align-items: center;
    flex-flow: row;
    width: 100%;
    gap: var(--tab-spacing, 0px);
    scrollbar-width: none;
    overflow-x: scroll;
    outline: none !important;
    color: var(--fg-tab) !important;
    padding: var(--tab-padding, 0);
    -webkit-app-region: drag;
  }
  .panel-tabs:focus-visible {
    outline: none !important;
  }
  .panel-tabs::-webkit-scrollbar {
    display: none;
  }
</style>
