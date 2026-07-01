<script lang="ts">
  import type { Component } from "svelte";
  import { tabReorder } from "./tabReorder";
  import { ButtonTool } from "Common/Buttons";
  import { Loader } from "Icons";
  import { Spiner } from "Common";
  import { CHROME_GPU, NEW_FILE_TAB_TITLE } from "Const";
  import TabIcon from "./TabIcon.svelte";

  let {
    currentTabId,
    items = $bindable([]),
    onClickTitle = (event: MouseEvent, id: number) => {},
    onClickClose = (event: any, id: number) => {},
    onReorder = (orderedIds: number[]) => {},
    onActivate = (id: number) => {},
    // Style props — provided by each frame's Tabs component
    closeIcon,
    closeIconSize,
    showDividers = false,
    tabClass = "tab",
    tabWrapperClass = "tab-wrapper",
    dividerClass = "tab-divider",
    dividerNearActiveClass = "tab-divider--near-active",
    tabActiveClass = "tab--active",
    tabTextClass = "tab-text",
    tabCloseClass = "tab-close",
  } = $props<{
    currentTabId: number | undefined;
    items: Types.TabFront[];
    onClickTitle: (event: MouseEvent, id: number) => void;
    onClickClose: (event: any, id: number) => void;
    onReorder: (orderedIds: number[]) => void;
    onActivate: (id: number) => void;
    closeIcon: Component<any>;
    closeIconSize: string;
    showDividers?: boolean;
    tabClass?: string;
    tabWrapperClass?: string;
    dividerClass?: string;
    dividerNearActiveClass?: string;
    tabActiveClass?: string;
    tabTextClass?: string;
    tabCloseClass?: string;
  }>();

  const normalBgColor = "transparent";
  const hoverBgColor = "transparent";

  const loadingItems: Dict<boolean> = {};

  function onHover(e: CustomEvent<MouseEvent>, itemId: number) {
    loadingItems[itemId] = false;
  }
  function onLeave(e: CustomEvent<MouseEvent>, itemId: number) {
    loadingItems[itemId] = true;
  }

  $effect(() => {
    for (const item of items) {
      if (item) loadingItems[item.id] = true;
    }
  });
</script>

<section use:tabReorder={{ onReorder, onActivate, enabled: items.length > 1 }}>
  {#each items as item, index (item.id)}
    <div class={tabWrapperClass} data-tab-id={item.id} data-loading={item.loading}>
      {#if showDividers && index > 0}
        <div
          class="{dividerClass} {currentTabId === item.id || currentTabId === items[index - 1]?.id ? dividerNearActiveClass : ''}"
        ></div>
      {/if}
      <div class="{tabClass} {currentTabId === item.id ? tabActiveClass : ''}">
        <div
          role="button"
          tabindex="0"
          class={tabTextClass}
          data-drag-handle
          onmouseup={(e) => onClickTitle(e, item.id)}
        >
          {#if (item.loading || !item.title) && item.title !== NEW_FILE_TAB_TITLE}
            <span class="tab-skeleton-icon"></span>
            <span class="tab-skeleton-title"></span>
          {:else}
            <TabIcon
              editorType={item.editorType}
              isLibrary={item.isLibrary}
              active={currentTabId === item.id}
              title={item.title}
            />
            <span>{item.title}</span>
          {/if}
        </div>
        <ButtonTool
          padding="0"
          {normalBgColor}
          {hoverBgColor}
          onButtonClick={(e: any) => onClickClose(e, item.id)}
          onMouseenter={(e: any) => onHover(e, item.id)}
          onMouseleave={(e: any) => onLeave(e, item.id)}
        >
          {#if item.loading && loadingItems[item.id] && item.title !== CHROME_GPU && item.title !== NEW_FILE_TAB_TITLE}
            <Spiner spin={true}>
              <Loader size="14" />
            </Spiner>
          {:else}
            {@const CloseIcon = closeIcon}
            <CloseIcon size={closeIconSize} />
          {/if}
        </ButtonTool>
      </div>
    </div>
  {/each}
</section>

<style>
  section:focus-visible { outline: none !important; }
  section {
    display: flex;
    align-items: center;
    outline: none !important;
  }
  /* The grabbed tab while dragging. tabReorder sets translateX inline so it
     follows the cursor; the neighbours slide via their own transform transition
     to open the drop gap. Lift it above the row and drop a soft shadow so it
     reads as "picked up". */
  :global(.tab-dragging) {
    z-index: 5;
    opacity: 0.97;
    cursor: grabbing;
    border-radius: 8px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
    /* Solid fill so the lifted tab never blends into the one it overlaps —
       even the New file tab, which isn't activated on grab. */
    background: #3d3d40;
  }

  :global(.tab-skeleton-icon) {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #5a5a5c;
    flex-shrink: 0;
  }
  :global(.tab-skeleton-title) {
    display: inline-block;
    width: 100px;
    height: 10px;
    border-radius: 3px;
    background: #5a5a5c;
    animation: tab-skeleton-pulse 1.4s ease-in-out infinite;
  }
  @keyframes tab-skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
</style>
