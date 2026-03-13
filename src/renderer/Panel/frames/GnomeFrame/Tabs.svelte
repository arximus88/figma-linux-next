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
    tabClass="g-tab"
    tabWrapperClass="g-tab-wrapper"
    dividerClass="g-divider"
    dividerNearActiveClass="g-divider--near-active"
    tabActiveClass="g-tab--active"
    tabTextClass="g-tab-text"
    tabCloseClass="g-tab-close"
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
    color: rgba(255, 255, 255, 0.8);
    padding: 0;
    -webkit-app-region: drag;
  }
  .tabs:focus-visible { outline: none !important; }
  .tabs::-webkit-scrollbar { display: none; }

  /* Gnome tab styles — classes are on the elements themselves so they survive DnD ghost cloning */
  :global(.g-tab-wrapper) { display: flex; align-items: center; gap: 2px; }

  :global(.g-divider) {
    width: 1px;
    height: 28px;
    background-color: #4f4f4f;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  :global(.g-divider--near-active) { background-color: transparent; }

  :global(.g-tab) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding-right: 5px;
    border-radius: 8px;
    background-color: transparent;
    border: none;
    height: 34px;
    transition: background-color 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  :global(.g-tab:hover) { background-color: rgba(61, 61, 64, 0.6); }
  :global(.g-tab--active) { background-color: #3d3d40; }

  :global(.g-tab-text) {
    display: flex;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    user-select: none;
    padding: 0 0 0 14px;
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--text-size-tab, 13px);
    font-weight: 600;
    outline: none !important;
  }
  :global(.g-tab-text:focus-visible) { outline: none !important; }
  :global(.g-tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.g-tab:hover .g-tab-text span) { color: rgba(255, 255, 255, 0.9); }
  :global(.g-tab--active .g-tab-text span) { color: rgba(255, 255, 255, 0.9); }

  :global(.g-tab div[role="button"]:not(.g-tab-text)) {
    background-color: transparent;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition: opacity 0.08s ease, background-color 0.08s ease;
  }
  :global(.g-tab:hover div[role="button"]:not(.g-tab-text)) { opacity: 1; }
  :global(.g-tab--active div[role="button"]:not(.g-tab-text)) { opacity: 1; }
  :global(.g-tab div[role="button"]:not(.g-tab-text):hover) { background-color: rgba(255, 255, 255, 0.06); }
</style>
