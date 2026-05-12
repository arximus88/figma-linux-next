<script lang="ts">
  import { tabs, currentTab } from "../../store";
  import { closeTab, tabFocus } from "../../Components/utils";
  import { Close } from "Icons";
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
    closeIcon={Close}
    closeIconSize="14"
    showDividers={false}
    tabClass="w-tab"
    tabWrapperClass="w-tab-wrapper"
    dividerClass="w-divider"
    dividerNearActiveClass="w-divider--near-active"
    tabActiveClass="w-tab--active"
    tabTextClass="w-tab-text"
    tabCloseClass="w-tab-close"
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
    gap: 0px;
    scrollbar-width: none;
    overflow-x: scroll;
    outline: none !important;
    color: var(--fg-tab, rgba(255, 255, 255, 0.8));
    padding: 0 16px;
    -webkit-app-region: drag;
  }
  .tabs:focus-visible { outline: none !important; }
  .tabs::-webkit-scrollbar { display: none; }

  /* Windows tab styles — classes are on the elements themselves so they survive DnD ghost cloning */
  :global(.w-tab-wrapper) { display: flex; align-items: center; gap: 0px; }

  :global(.w-tab) {
    display: flex;
    align-items: center;
    margin: 0 0 0 2px;
    border-radius: 0px;
    background-color: var(--bg-tab, transparent);
    border: none;
    height: 40px;
    transition: background-color 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  :global(.w-tab:hover) { background-color: var(--bg-tab-hover, rgba(255, 255, 255, 0.08)); }
  :global(.w-tab--active) { background-color: var(--bg-tab-hover, rgba(255, 255, 255, 0.08)); }

  :global(.w-tab-text) {
    display: flex;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    gap: 6px;
    user-select: none;
    padding: 0 0 0 10px;
    color: var(--fg-tab, rgba(255, 255, 255, 0.8));
    font-size: var(--text-size-tab, 14px);
    outline: none !important;
  }
  :global(.w-tab-text > svg) {
    flex-shrink: 0;
  }
  :global(.w-tab-text:focus-visible) { outline: none !important; }
  :global(.w-tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.w-tab:hover .w-tab-text span) { color: var(--fg-tab-hover, rgba(255, 255, 255, 1)); }
  :global(.w-tab--active .w-tab-text span) { color: var(--fg-tab-hover, rgba(255, 255, 255, 1)); }

  :global(.w-tab div[role="button"]) {
    background-color: transparent;
    border-radius: 0px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 7px;
    opacity: 1;
  }
</style>
