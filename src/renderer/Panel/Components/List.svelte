<script lang="ts">
  import type { Component } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "../../svelte-dnd-action";
  import { ButtonTool } from "Common/Buttons";
  import { Loader } from "Icons";
  import { Spiner } from "Common";
  import { CHROME_GPU, NEW_FILE_TAB_TITLE } from "Const";

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

  const flipDurationMs = 0;
  const constrainAxisY = true;
  const morphDisabled = true;
  const cursorStartDrag = "default";
  const cursorDragging = "default";
  const cursorDrop = "default";
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
    <div class={tabWrapperClass} animate:flip={{ duration: flipDurationMs }}>
      {#if showDividers && index > 0}
        <div
          class="{dividerClass} {currentTabId === item.id || currentTabId === items[index - 1]?.id ? dividerNearActiveClass : ''}"
        ></div>
      {/if}
      <div class="{tabClass} {currentTabId === item.id ? tabActiveClass : ''}">
        <div role="button" tabindex="0" class={tabTextClass} onmouseup={(e) => onClickTitle(e, item.id)}>
          <span>{item.title}</span>
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
  :global([data-is-dnd-shadow-item]) {
    width: 0 !important;
    min-width: 0 !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
  }
</style>
