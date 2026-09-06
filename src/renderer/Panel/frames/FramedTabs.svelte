<script lang="ts">
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { NEW_FILE_TAB_TITLE } from "../../../constants/other";
  import List from "../Components/List.svelte";
  import { closeTab, tabFocus } from "../Components/utils";
  import { currentTab, tabs } from "../store";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  // Class prefix: gnome -> "g", kde -> "k", everything else -> "w". All class
  // families are defined below; only the active one is emitted, so they never collide.
  const p = $derived(style === "gnome" ? "g" : style === "kde" ? "k" : "w");

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
      case 0:
        tabFocus(id);
        break;
      case 1:
        closeTab(id);
        break;
      case 2:
        window.figmaApi.send("openTabMenu", id);
        break;
    }
  }

  function onClickClose(_event: MouseEvent, id: number) {
    closeTab(id);
  }

  // The strip was reordered by drag. Renumber `order` from the new visual
  // sequence (New file stays pinned first) and push it to the main process so
  // the tab Map — and thus Ctrl+(Shift+)Tab cycling — follows the visual order
  // immediately, not only on window close.
  function onReorder(orderedIds: number[]) {
    const byId = new Map(tabs.value.map((t) => [t.id, t]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((t): t is Types.TabFront => !!t)
      .map((tab, index) => ({ ...tab, order: tab.title === NEW_FILE_TAB_TITLE ? 0 : index + 1 }))
      .sort((a, b) => (a.order > b.order ? 1 : -1));
    tabs.set(next);
    window.figmaApi.send("reorderTabs", $state.snapshot(next));
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
    closeIcon={cfg.tabs.closeIcon.component}
    closeIconSize={cfg.tabs.closeIcon.size}
    showDividers={cfg.tabs.showDividers}
    tabClass="{p}-tab"
    tabWrapperClass="{p}-tab-wrapper"
    dividerClass="{p}-divider"
    dividerNearActiveClass="{p}-divider--near-active"
    tabActiveClass="{p}-tab--active"
    tabTextClass="{p}-tab-text"
    tabCloseClass="{p}-tab-close"
    {onClickTitle}
    {onClickClose}
    {onReorder}
    onActivate={tabFocus}
  />
</div>

<style>
  /* Shared container; frame-specific gap/color/padding are scoped by data-frame
     so the class stays just `.tabs` (no per-frame element class). */
  .tabs {
    display: flex;
    flex-grow: 1;
    align-items: center;
    flex-flow: row;
    width: 100%;
    scrollbar-width: none;
    overflow-x: scroll;
    outline: none !important;
    -webkit-app-region: drag;
  }
  .tabs:focus-visible {
    outline: none !important;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }

  :global([data-frame="gnome"]) .tabs {
    gap: 2px;
    color: var(--frame-fg-muted);
    padding: 0;
  }
  :global([data-frame="kde"]) .tabs {
    gap: 0;
    color: var(--frame-fg-muted);
    padding: 0 4px;
    align-self: stretch;
  }
  :global([data-frame="windows"]) .tabs {
    gap: 0px;
    color: var(--fg-tab, rgba(255, 255, 255, 0.8));
    padding: 0 16px;
  }

  /* ── Gnome tab styles — classes are on the elements themselves so they
     survive DnD ghost cloning ─────────────────────────────────────────── */
  :global(.g-tab-wrapper) {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  :global(.g-divider) {
    width: 1px;
    height: 28px;
    background-color: var(--frame-divider);
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  :global(.g-divider--near-active) {
    background-color: transparent;
  }

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
  :global(.g-tab:hover) {
    background-color: var(--frame-tab-hover);
  }
  :global(.g-tab--active) {
    background-color: var(--frame-tab-active);
  }

  :global(.g-tab-text) {
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    gap: 6px;
    user-select: none;
    cursor: pointer;
    padding: 0 0 0 10px;
    color: var(--frame-fg-muted);
    font-size: var(--text-size-tab, 13px);
    font-weight: 600;
    outline: none !important;
  }
  :global(.g-tab-text > svg) {
    flex-shrink: 0;
  }
  :global(.g-tab-text:focus-visible) {
    outline: none !important;
  }
  :global(.g-tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.g-tab:hover .g-tab-text span) {
    color: var(--frame-fg);
  }
  :global(.g-tab--active .g-tab-text span) {
    color: var(--frame-fg);
  }

  :global(.g-tab div[role="button"]:not(.g-tab-text)) {
    background-color: transparent;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition:
      opacity 0.08s ease,
      background-color 0.08s ease;
  }
  :global(.g-tab:hover div[role="button"]:not(.g-tab-text)) {
    opacity: 1;
  }
  :global(.g-tab--active div[role="button"]:not(.g-tab-text)) {
    opacity: 1;
  }
  :global(.g-tab div[role="button"]:not(.g-tab-text):hover) {
    background-color: var(--frame-btn-hover);
  }

  /* ── KDE / Breeze tab styles — like Dolphin/Konsole: the active tab takes the
     view background and an accent line on top, the rest stay flat ────────── */
  :global(.k-tab-wrapper) {
    display: flex;
    align-items: stretch;
    align-self: stretch;
    gap: 0;
  }

  :global(.k-tab) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding-right: 4px;
    border-radius: 3px 3px 0 0;
    background-color: transparent;
    border: none;
    height: 40px;
    transition: background-color 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  :global(.k-tab:hover) {
    background-color: var(--frame-tab-hover);
  }
  :global(.k-tab--active),
  :global(.k-tab--active:hover) {
    background-color: var(--frame-tab-active);
  }
  :global(.k-tab--active::before) {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    border-radius: 3px 3px 0 0;
    background-color: var(--frame-accent);
  }

  :global(.k-tab-text) {
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    gap: 6px;
    user-select: none;
    cursor: pointer;
    padding: 0 0 0 10px;
    color: var(--frame-fg-muted);
    font-size: var(--text-size-tab, 14px);
    outline: none !important;
  }
  :global(.k-tab-text > svg) {
    flex-shrink: 0;
  }
  :global(.k-tab-text:focus-visible) {
    outline: none !important;
  }
  :global(.k-tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.k-tab:hover .k-tab-text span),
  :global(.k-tab--active .k-tab-text span) {
    color: var(--frame-fg);
  }

  /* Close: hidden until hover/active, round halo like the window controls */
  :global(.k-tab div[role="button"]:not(.k-tab-text)) {
    background-color: transparent;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition:
      opacity 0.08s ease,
      background-color 0.08s ease;
  }
  :global(.k-tab:hover div[role="button"]:not(.k-tab-text)),
  :global(.k-tab--active div[role="button"]:not(.k-tab-text)) {
    opacity: 1;
  }
  :global(.k-tab div[role="button"]:not(.k-tab-text):hover) {
    background-color: var(--frame-btn-hover);
  }

  /* ── Windows tab styles ─────────────────────────────────────────────── */
  :global(.w-tab-wrapper) {
    display: flex;
    align-items: center;
    gap: 0px;
  }

  :global(.w-tab) {
    display: flex;
    align-items: center;
    margin: 0;
    border-radius: 0px;
    background-color: var(--bg-tab, transparent);
    border: none;
    /* 1px separator on the right, like Figma's Windows tab strip */
    box-shadow: inset -1px 0 0 var(--frame-divider);
    height: 40px;
    transition: background-color 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  :global(.w-tab:hover) {
    background-color: var(--bg-tab-hover, rgba(255, 255, 255, 0.08));
  }
  :global(.w-tab--active) {
    background-color: var(--bg-tab-active, rgba(255, 255, 255, 0.08));
    box-shadow: none;
  }
  :global(.w-tab--active .w-tab-text) {
    font-weight: 600;
  }

  :global(.w-tab-text) {
    display: flex;
    flex: 1;
    align-self: stretch;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    gap: 6px;
    user-select: none;
    cursor: pointer;
    padding: 0 0 0 10px;
    color: var(--fg-tab, rgba(255, 255, 255, 0.8));
    font-size: var(--text-size-tab, 14px);
    outline: none !important;
  }
  :global(.w-tab-text > svg) {
    flex-shrink: 0;
  }
  :global(.w-tab-text:focus-visible) {
    outline: none !important;
  }
  :global(.w-tab-text span) {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.w-tab:hover .w-tab-text span) {
    color: var(--fg-tab-hover, rgba(255, 255, 255, 1));
  }
  :global(.w-tab--active .w-tab-text span) {
    color: var(--fg-tab-hover, rgba(255, 255, 255, 1));
  }

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
