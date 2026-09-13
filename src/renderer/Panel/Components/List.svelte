<script lang="ts">
  import type { Component } from "svelte";
  import { tabReorder } from "./tabReorder";
  import { tabSlide } from "./motion";
  import { tabHover } from "./tabHover";
  import { layout } from "../store";
  import { ButtonTool } from "Common/Buttons";
  import { Loader } from "Icons";
  import { Spiner } from "Common";
  import { CHROME_GPU, NEW_FILE_TAB_TITLE } from "Const";
  import TabIcon from "./TabIcon.svelte";

  let {
    currentTabId,
    items = $bindable([]),
    groups = [],
    onClickTitle = (event: MouseEvent, id: number) => {},
    onClickClose = (event: any, id: number) => {},
    onReorder = (orderedIds: number[]) => {},
    onActivate = (id: number) => {},
    onToggleGroupCollapse = (groupId: string) => {},
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
    groups?: Types.TabGroup[];
    onClickTitle: (event: MouseEvent, id: number) => void;
    onClickClose: (event: any, id: number) => void;
    onReorder: (orderedIds: number[]) => void;
    onActivate: (id: number) => void;
    onToggleGroupCollapse?: (groupId: string) => void;
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

  type Row =
    | { type: "tab"; tab: Types.TabFront; index: number }
    | { type: "group"; group: Types.TabGroup; tabs: { tab: Types.TabFront; index: number }[] };

  // Nest each group's tabs under its header as real DOM children, instead of
  // flat siblings the CSS has to line up by hand — a single border/background
  // on the group container then naturally spans exactly its own tabs, with no
  // margin bookkeeping needed to fake continuity between separate elements.
  // Tabs are grouped by contiguous `groupId` runs in `items`' current order;
  // dragging a tab away from its cluster (out of scope for Phase 1) would
  // start a second same-group run rather than lose the tab.
  const rows = $derived.by(() => {
    const result: Row[] = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      const group = item.groupId
        ? groups.find((g: Types.TabGroup) => g.id === item.groupId)
        : undefined;

      if (!group) {
        // Ungrouped, or a groupId that doesn't (yet) resolve — render plain.
        result.push({ type: "tab", tab: item, index: i });
        i++;
        continue;
      }

      const gid = item.groupId;
      const groupTabs: { tab: Types.TabFront; index: number }[] = [];
      while (i < items.length && items[i].groupId === gid) {
        groupTabs.push({ tab: items[i], index: i });
        i++;
      }
      result.push({ type: "group", group, tabs: groupTabs });
    }
    return result;
  });
</script>

<section
  use:tabReorder={{ onReorder, onActivate, enabled: items.length > 1 }}
  use:tabHover={{ enabled: layout.tabHoverPreviews }}
>
  {#each rows as row (row.type === "group" ? `group-${row.group.id}` : `tab-${row.tab.id}`)}
    {#if row.type === "group"}
      <div class="tab-group-container" style="--group-color: {row.group.color}">
        <button
          type="button"
          class="tab-group-header"
          onclick={() => onToggleGroupCollapse(row.group.id)}
          aria-expanded={!row.group.collapsed}
          aria-label={row.group.collapsed
            ? `Expand group ${row.group.label}`
            : `Collapse group ${row.group.label}`}
        >
          <span class="tab-group-dot"></span>
          <span class="tab-group-label">{row.group.label}</span>
          <span class="tab-group-chevron" class:collapsed={row.group.collapsed}>▾</span>
        </button>
        {#if !row.group.collapsed}
          {#each row.tabs as entry (entry.tab.id)}
            {@render tabRow(entry.tab, entry.index, true)}
          {/each}
        {/if}
      </div>
    {:else}
      {@render tabRow(row.tab, row.index, false)}
    {/if}
  {/each}
</section>

{#snippet tabRow(item: Types.TabFront, index: number, grouped: boolean)}
  <div
    class={tabWrapperClass}
    data-tab-id={item.id}
    data-loading={item.loading}
    transition:tabSlide
  >
    {#if showDividers && index > 0}
      <div
        class="{dividerClass} {currentTabId === item.id || currentTabId === items[index - 1]?.id ? dividerNearActiveClass : ''}"
      ></div>
    {/if}
    <div
      class="{tabClass} {currentTabId === item.id ? tabActiveClass : ''}"
      class:tab-grouped={grouped}
    >
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
{/snippet}

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

  /* The group is a real flex parent of its header + tabs (see `rows` above),
     not a run of siblings the CSS has to line up — `gap: 0` alone guarantees
     the header and its tabs sit flush, no margin arithmetic required. The
     border lives here (one line under the whole group) instead of on each
     child individually, now that there's an actual parent to put it on.
     The container has no explicit height (it isn't known here — frame-
     specific tab heights live in FramedTabs.svelte) — it auto-sizes to its
     tallest child (a tab wrapper), and a plain `border-bottom` would add 3px
     on top of that, which can then get clipped by `.tabs`' overflow the same
     way it did when the border briefly lived on the tab wrapper directly
     (verified empirically — see git history). The `margin-bottom` on each
     child below (matching the border width) cancels that growth so the
     container's rendered height never changes, while the border itself
     still paints at the (unmoved) bottom edge. */
  .tab-group-container {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 0 6px;
    flex-shrink: 0;
    border-bottom: 5px solid var(--group-color);
  }
  :global(.tab-group-container > div) {
    margin-bottom: -5px;
  }

  .tab-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    box-sizing: border-box;
    margin: 0;
    padding: 0 8px;
    border: none;
    background: color-mix(in srgb, var(--group-color) 32%, transparent);
    color: var(--frame-fg-muted, rgba(255, 255, 255, 0.8));
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }
  .tab-group-header:hover {
    background: color-mix(in srgb, var(--group-color) 45%, transparent);
  }
  .tab-group-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--group-color);
    flex-shrink: 0;
  }
  .tab-group-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }
  .tab-group-chevron {
    font-size: 9px;
    opacity: 0.7;
    transition: transform var(--motion-hover, 0.15s) ease;
  }
  .tab-group-chevron.collapsed {
    transform: rotate(-90deg);
  }

  /* Grouped-tab affordance: a light tint of the group's color, matching the
     header's own tint — the border lives once on `.tab-group-container`
     (the parent) instead of here, so header + tabs just get the tint.
     Applied to the inner {tabClass} element (not the wrapper) so it's the
     same element that owns the tab's own background — it naturally respects
     that element's own border-radius.
     Specificity note: `.g-tab`/`.k-tab`/`.w-tab` (FramedTabs.svelte) each set
     their own base `background-color`. Since that rule lives in a different
     component, its position in the final bundled stylesheet isn't under our
     control, so a plain `.tab-grouped` class (equal specificity) could lose
     to it on source order alone. The `div` type selector bumps specificity
     just enough to always win the *base* state, without reaching for
     !important — hover/active still show their own state color on top,
     which is the desired behavior (the active tab keeps its own look). */
  :global(div.tab-grouped) {
    background-color: color-mix(in srgb, var(--group-color) 32%, transparent);
  }

  :global(.tab-skeleton-icon) {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    /* Loading placeholder for the tab's icon/title; per-frame shade, the
       Legacy Windows frame keeps the neutral grey. */
    background: var(--frame-skeleton, #5a5a5c);
    flex-shrink: 0;
  }
  :global(.tab-skeleton-title) {
    display: inline-block;
    width: 100px;
    height: 10px;
    border-radius: 3px;
    background: var(--frame-skeleton, #5a5a5c);
    animation: tab-skeleton-pulse 1.4s ease-in-out infinite;
  }
  @keyframes tab-skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
</style>
