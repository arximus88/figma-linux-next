<script lang="ts">
  import type { Component } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "../../svelte-dnd-action";
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
    onDndConsider = (event: any) => {},
    onDndFinalize = (event: any) => {},
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
    onDndConsider: (event: any) => void;
    onDndFinalize: (event: any) => void;
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

  // Live reorder: tabs slide to make room as you drag (FLIP). The shadow item
  // (an invisible spacer the size of the dragged tab) is styled into a visible
  // drop slot below, so you can see where the tab will land.
  const flipDurationMs = 180;
  const constrainAxisY = true; // lock Y → the dragged clone slides along the strip
  const morphDisabled = true;
  const cursorStartDrag = "grabbing";
  const cursorDragging = "grabbing";
  const cursorDrop = "grabbing";
  const cursorHover = "default";
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

<section
  use:dndzone={{
    items,
    flipDurationMs,
    morphDisabled,
    constrainAxisY,
    cursorStartDrag,
    cursorDragging,
    cursorDrop,
    cursorHover,
  }}
  onconsider={onDndConsider as any}
  onfinalize={onDndFinalize as any}
>
  {#each items as item, index (item.id)}
    <div
      class={tabWrapperClass}
      data-tab-id={item.id}
      data-loading={item.loading}
      animate:flip={{ duration: flipDurationMs }}
    >
      {#if showDividers && index > 0}
        <div
          class="{dividerClass} {currentTabId === item.id || currentTabId === items[index - 1]?.id ? dividerNearActiveClass : ''}"
        ></div>
      {/if}
      <div class="{tabClass} {currentTabId === item.id ? tabActiveClass : ''}">
        <div role="button" tabindex="0" class={tabTextClass} onmouseup={(e) => onClickTitle(e, item.id)}>
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
  /* Drop slot. The dnd library inserts a shadow clone of the dragged tab at the
     drop position and hides it (visibility:hidden); it keeps the dragged tab's
     footprint, so the surrounding tabs FLIP open to make room. We re-show the
     wrapper box (but keep its cloned content hidden) and paint it as a
     highlighted slot, so the landing spot is explicit. */
  :global([data-is-dnd-shadow-item]) {
    visibility: visible !important;
    box-sizing: border-box;
    outline: 2px dashed rgba(255, 255, 255, 0.35);
    outline-offset: -2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
  }
  :global([data-is-dnd-shadow-item] > *) {
    visibility: hidden;
  }
  /* Windows tabs are square; match the slot to the frame. */
  :global([data-frame="windows"] [data-is-dnd-shadow-item]) {
    border-radius: 0;
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
