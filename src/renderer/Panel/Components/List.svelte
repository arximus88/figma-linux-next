 <script lang="ts">
  import type { FrameConfig } from "Utils/Render/frameConfig";
  let { currentTabId, config, items = $bindable([]), onClickTitle = (event: MouseEvent, id: number) => {}, onClickClose = (event: CustomEvent, id: number) => {}, onDndConsider = (event: any) => {}, onDndFinalize = (event: any) => {} } = $props<{
    currentTabId: number | undefined;
    config: FrameConfig;
    items: Types.TabFront[];
    onClickTitle: (event: MouseEvent, id: number) => void;
    onClickClose: (event: any, id: number) => void;
    onDndConsider: (event: any) => void;
    onDndFinalize: (event: any) => void;
  }>();
  import { flip } from "svelte/animate";
  import { dndzone } from "../../svelte-dnd-action";
  import { ButtonTool } from "Common/Buttons";
  import { Loader } from "Icons";
  import { Spiner } from "Common";
  import { CHROME_GPU, NEW_FILE_TAB_TITLE } from "Const";

  const loadingItems: Dict<boolean> = {};
  const flipDurationMs = 150;
  const constrainAxisY = true;
  const cursorStartDrag = "default";
  const cursorDragging = "default";
  const cursorDrop = "default";
  const cursorHover = "default";
  const normalBgColor = "transparent";
  const hoverBgColor = "transparent";

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
    items: items,
    flipDurationMs,
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
      class="tab-wrapper"
      animate:flip={{ duration: flipDurationMs }}
    >
      {#if config.tabs.showDividers && index > 0}
        <div class="tab-divider" class:near-active={currentTabId === item.id || currentTabId === items[index - 1]?.id}></div>
      {/if}
      <div
        class="panel-tab {currentTabId === item.id ? 'panel-tab__active' : ''}"
      >
        <div role="button" tabindex="0" class="text" onmouseup={(e) => onClickTitle(e, item.id)}>
          <span>
            {item.title}
          </span>
        </div>
        <ButtonTool
          padding="var(--tab-close-padding, 0 7px)"
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
            <config.tabs.closeIcon.component size={config.tabs.closeIcon.size} />
          {/if}
        </ButtonTool>
      </div>
    </div>
  {/each}
</section>

<style>
  section:focus-visible {
    outline: none !important;
  }
  section {
    display: flex;
    align-items: center;
    gap: var(--tab-spacing, 0px);
    outline: none !important;
  }

  .tab-wrapper {
    display: flex;
    align-items: center;
    gap: var(--tab-spacing, 0px);
  }

  .text:focus-visible {
    outline: none !important;
  }
  .text {
    display: flex;
    min-width: 60px;
    max-width: 200px;
    align-items: center;
    user-select: none;
    padding: var(--tab-text-padding, 0 0 0 12px);
    color: var(--fg-tab);
    font-size: var(--text-size-tab);
    outline: none !important;
  }
  span {
    display: inline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-divider {
    width: var(--tab-divider-width, 0px);
    height: var(--tab-divider-height, 0px);
    background-color: var(--tab-divider-color, transparent);
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  .tab-divider.near-active {
    background-color: var(--tab-divider-active-color, transparent);
  }

  .panel-tab:focus-visible {
    outline: none !important;
  }
  .panel-tab {
    display: flex;
    align-items: center;
    margin: var(--tab-margin, 0 0 0 2px);
    border-radius: var(--tab-radius, 3px 3px 0 0);
    background-color: var(--bg-tab);
    border: var(--tab-border, none);
    height: var(--tab-height, 40px);
    transition: all 0.08s ease;
    outline: none !important;
    -webkit-app-region: no-drag;
    box-sizing: border-box;
  }
  .panel-tab:hover {
    background-color: var(--bg-tab-hover);
  }
  .panel-tab__active {
    background-color: var(--tab-active-bg, var(--bg-tab-hover));
  }
  .panel-tab:hover span {
    color: var(--fg-tab-hover);
  }
  .panel-tab__active span {
    color: var(--fg-tab-hover);
  }
  .panel-tab :global(div[role="button"]) {
    background-color: var(--tab-close-bg, transparent);
    border-radius: var(--tab-close-radius, 0px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
