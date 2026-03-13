<script lang="ts">
  import { tabs, currentTab } from "../../store";
  import { closeTab, tabFocus } from "../../Components/utils";
  import { GnomeTabClose } from "Icons";
  import { NEW_FILE_TAB_TITLE } from "../../../../constants/other";
  import List from "../../Components/List.svelte";

  let currentTabId = $state<number | undefined>();
  let item: HTMLDivElement;

  function wheelHandler(e: WheelEvent) {
    if (e.deltaY > 0) item.scrollLeft += 50;
    else item.scrollLeft -= 50;
  }

  function dblclickHandler(e: MouseEvent) {
    window.figmaApi.send("windowMaximize");
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function onClickTitle(event: MouseEvent, id: number) {
    switch (event.button) {
      case 0: tabFocus(id); break;
      case 1: closeTab(id); break;
      case 2: window.figmaApi.send("openTabMenu", id); break;
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
        .map((tab, index) => ({ ...tab, order: tab.title === NEW_FILE_TAB_TITLE ? 0 : index + 1 }))
        .sort((a, b) => (a.order > b.order ? 1 : -1)),
    );
  }

  $effect(() => {
    const id = currentTab.value;
    currentTabId = typeof id === "number" ? id : undefined;
  });
</script>

<div
  role="tablist"
  tabindex="0"
  class="tabs"
  bind:this={item}
  onwheel={wheelHandler}
  ondblclick={dblclickHandler}
>
  <List
    items={tabs.value}
    {currentTabId}
    closeIcon={GnomeTabClose}
    closeIconSize="24"
    showDividers={true}
    tabClass="tab"
    tabWrapperClass="tab-wrapper"
    dividerClass="divider"
    dividerNearActiveClass="divider--near-active"
    tabActiveClass="tab--active"
    tabTextClass="tab-text"
    tabCloseClass="tab-close"
    {onClickTitle}
    {onClickClose}
    {onDndConsider}
    {onDndFinalize}
  />
</div>

<style>
  .tabs {
    display: flex;
    flex-grow: 1;
    align-items: center;
    flex-flow: row;
    width: 100%;
    gap: 2px;
    scrollbar-width: none;
    overflow-x: scroll;
    outline: none !important;
    color: var(--fg-tab);
    padding: 0;
    -webkit-app-region: drag;
  }
  .tabs:focus-visible { outline: none !important; }
  .tabs::-webkit-scrollbar { display: none; }

  /* Tab styles — co-located here for GNOME */
  :global(.tab-wrapper) { display: flex; align-items: center; gap: 2px; }

  :global(.divider) {
    width: 1px;
    height: 28px;
    background-color: #4f4f4f;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  :global(.divider--near-active) { background-color: transparent; }

  :global(.tab) {
    display: flex;
    align-items: center;
    margin: 0;
    border-radius: 8px;
    background-color: var(--bg-tab);
    border: none;
    height: 34px;
    transition: all 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  :global(.tab:hover) { background-color: var(--bg-tab-hover); }
  :global(.tab--active) { background-color: #3d3d40; }

  :global(.tab-text) {
    display: flex;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    user-select: none;
    padding: 0 0 0 14px;
    color: var(--fg-tab);
    font-size: var(--text-size-tab);
    font-weight: 600;
    outline: none !important;
  }
  :global(.tab-text:focus-visible) { outline: none !important; }
  :global(.tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.tab:hover .tab-text span) { color: var(--fg-tab-hover); }
  :global(.tab--active .tab-text span) { color: var(--fg-tab-hover); }

  :global(.tab-close) { display: flex; align-items: center; justify-content: center; }
  :global(.tab div[role="button"]) {
    background-color: transparent;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition: opacity 0.08s ease, background-color 0.08s ease;
  }
  :global(.tab:hover div[role="button"]) { opacity: 1; }
  :global(.tab--active div[role="button"]) { opacity: 1; }
  :global(.tab div[role="button"]:hover) { background-color: rgba(255, 255, 255, 0.06); }
</style>
