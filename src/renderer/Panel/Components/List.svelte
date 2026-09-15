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
    frameStyle = "gnome",
    onClickTitle = (event: MouseEvent, id: number) => {},
    onClickClose = (event: any, id: number) => {},
    onReorder = (orderedIds: number[], groupAssignments?: Map<number, string | undefined>) => {},
    onActivate = (id: number) => {},
    onToggleGroupCollapse = (groupId: string) => {},
    onContextMenuGroup = (event: MouseEvent, groupId: string) => {},
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
    frameStyle?: Types.FrameStyle;
    onClickTitle: (event: MouseEvent, id: number) => void;
    onClickClose: (event: any, id: number) => void;
    onReorder: (orderedIds: number[], groupAssignments?: Map<number, string | undefined>) => void;
    onActivate: (id: number) => void;
    onToggleGroupCollapse?: (groupId: string) => void;
    onContextMenuGroup?: (event: MouseEvent, groupId: string) => void;
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
  use:tabReorder={{
    onReorder,
    onActivate,
    onToggleGroupCollapse,
    enabled: items.length > 1 || groups.length > 0,
  }}
  use:tabHover={{ enabled: layout.tabHoverPreviews }}
>
  {#each rows as row (row.type === "group" ? `group-${row.group.id}-${row.tabs[0]?.tab.id ?? "empty"}` : `tab-${row.tab.id}`)}
    {#if row.type === "group"}
      <div
        role="group"
        aria-label={row.group.label}
        class="tab-group-container"
        data-group-id={row.group.id}
        data-frame={frameStyle}
        style="--group-color: {row.group.color}"
        ondblclick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          class="tab-group-header"
          onclick={() => onToggleGroupCollapse(row.group.id)}
          ondblclick={(e) => e.stopPropagation()}
          oncontextmenu={(e) => onContextMenuGroup(e, row.group.id)}
          aria-expanded={!row.group.collapsed}
          aria-label={row.group.collapsed
            ? `Expand group ${row.group.label}`
            : `Collapse group ${row.group.label}`}
        >
          <span class="tab-group-dot"></span>
          <span class="tab-group-label">{row.group.label}</span>
        </button>
        {#if !row.group.collapsed}
          {#each row.tabs as entry, tabIdx (entry.tab.id)}
            {@render tabRow(entry.tab, entry.index, true, tabIdx)}
          {/each}
        {/if}
      </div>
    {:else}
      {@render tabRow(row.tab, row.index, false, 0)}
    {/if}
  {/each}
</section>

{#snippet tabRow(item: Types.TabFront, index: number, grouped: boolean, tabIdx: number = 0)}
  <div
    class={tabWrapperClass}
    data-tab-id={item.id}
    data-loading={item.loading}
    transition:tabSlide
  >
    {#if showDividers && (grouped ? tabIdx > 0 : index > 0)}
      <div
        class="{dividerClass} {currentTabId === item.id || currentTabId === items[index - 1]?.id ? dividerNearActiveClass : ''}"
      ></div>
    {/if}
    <div
      class="{tabClass} {currentTabId === item.id ? tabActiveClass : ''}"
      class:tab-grouped={grouped}
      class:tab-discarded={item.discarded}
    >
      <div
        role="button"
        tabindex="0"
        class={tabTextClass}
        data-drag-handle
        onmouseup={(e) => onClickTitle(e, item.id)}
        oncontextmenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.figmaApi.send("openTabMenu", item.id);
        }}
        ondblclick={(e) => e.stopPropagation()}
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
        onContextmenu={(e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          window.figmaApi.send("openTabMenu", item.id);
        }}
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
  :global(.group-dragging) {
    z-index: 25 !important;
    opacity: 0.95;
    cursor: grabbing !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  }
  :global(.tab-group-drop-target) {
    box-shadow: 0 0 0 2px var(--group-color), 0 2px 10px rgba(0, 0, 0, 0.3) !important;
    transition: box-shadow 0.15s ease;
  }
  .tab-group-header:active {
    cursor: grabbing;
  }

  /* The group is a real flex parent of its header + tabs (see `rows` above),
     not a run of siblings the CSS has to line up — `gap: 0` alone guarantees
     the header and its tabs sit flush, no margin arithmetic required.

     Chrome-style bracket: a thin colored bar with fully rounded (pill) end
     caps runs along the bottom of the whole cluster, and the header chip's
     outer corners (plus the last tab's outer corners) get a matching rounded-
     rect treatment so the header-to-tabs run reads as one soft bracket
     wrapping the group, not a hard-edged box.

     Height-neutrality (a real, empirically-verified constraint — see git
     history): the container has no explicit height — frame-specific tab
     heights live in FramedTabs.svelte — so it auto-sizes to its tallest
     in-flow child (a tab wrapper). A plain `border-bottom` here (an earlier
     version of this design) adds to that auto height, and the extra pixels
     get silently clipped by `.tabs`' overflow-x:scroll (which per spec forces
     overflow-y to `auto`) once they push past the panel's tab-row ceiling.
     The bar below is `position: absolute`, so it is pulled out of normal
     flow entirely and paints *inside* the container's existing box (flush
     with the bottom edge) instead of adding to it — no compensating negative
     margin is needed, and the container's rendered height stays exactly
     equal to an ungrouped tab wrapper's height for the same frame. */
  /* ── Tab Group Container ──────────────────────────────────────────── */
  .tab-group-container {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  /* ── GNOME Frame ──────────────────────────────────────────────────── */
  .tab-group-container[data-frame="gnome"] {
    height: 34px;
    border: 1px solid color-mix(in srgb, var(--group-color) 45%, transparent);
    border-radius: 8px;
    margin: 0 4px;
    padding-left: 5px;
    padding-right: 3px;
    gap: 2px;
    background-color: transparent;
  }

  .tab-group-container[data-frame="gnome"] .tab-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    box-sizing: border-box;
    margin: 0;
    padding: 0 8px 0 6px;
    border: none;
    border-radius: 4px;
    background: color-mix(in srgb, var(--group-color) 32%, transparent);
    color: var(--frame-fg, rgba(255, 255, 255, 0.9));
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
    transition: background-color var(--motion-hover, 0.15s) ease;
  }
  .tab-group-container[data-frame="gnome"] .tab-group-header:hover {
    background: color-mix(in srgb, var(--group-color) 48%, transparent);
  }

  :global(.tab-group-container[data-frame="gnome"] .g-tab) {
    height: 28px !important;
    border-radius: 6px !important;
    background-color: transparent !important;
  }
  :global(.tab-group-container[data-frame="gnome"] .g-tab:not(.g-tab--active):hover) {
    background-color: var(--frame-tab-hover) !important;
  }
  :global(.tab-group-container[data-frame="gnome"] .g-tab--active) {
    background-color: color-mix(in srgb, var(--group-color) 38%, var(--frame-tab-active, rgba(255, 255, 255, 0.15))) !important;
    border-radius: 6px !important;
    color: var(--frame-fg) !important;
  }
  :global(.tab-group-container[data-frame="gnome"] .g-divider) {
    height: 18px !important;
    background-color: color-mix(in srgb, var(--group-color) 35%, var(--frame-divider)) !important;
  }
  :global(.tab-group-container[data-frame="gnome"] .g-divider--near-active) {
    background-color: transparent !important;
  }

  /* ── KDE Frame ────────────────────────────────────────────────────── */
  .tab-group-container[data-frame="kde"] {
    height: 40px;
    border: none;
    border-radius: 3px 3px 0 0;
    margin: 0 4px;
    padding-left: 5px;
    padding-right: 2px;
    gap: 0;
    background-color: transparent;
  }
  .tab-group-container[data-frame="kde"]::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: var(--group-color);
    border-radius: 3px 3px 0 0;
  }
  .tab-group-container[data-frame="kde"] .tab-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    box-sizing: border-box;
    margin: 0 4px 0 0;
    padding: 0 8px 0 6px;
    border: none;
    border-radius: 4px;
    background: color-mix(in srgb, var(--group-color) 28%, transparent);
    color: var(--frame-fg, rgba(255, 255, 255, 0.9));
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
    transition: background-color var(--motion-hover, 0.15s) ease;
  }
  .tab-group-container[data-frame="kde"] .tab-group-header:hover {
    background: color-mix(in srgb, var(--group-color) 42%, transparent);
  }
  :global(.tab-group-container[data-frame="kde"] .k-tab) {
    height: 38px !important;
    background-color: transparent !important;
  }
  :global(.tab-group-container[data-frame="kde"] .k-tab:not(.k-tab--active):hover) {
    background-color: var(--frame-tab-hover) !important;
  }
  :global(.tab-group-container[data-frame="kde"] .k-tab--active) {
    background-color: color-mix(in srgb, var(--group-color) 25%, var(--frame-tab-active)) !important;
  }
  :global(.tab-group-container[data-frame="kde"] .k-tab--active::before) {
    background-color: var(--group-color) !important;
  }

  /* ── Windows Frame ────────────────────────────────────────────────── */
  .tab-group-container[data-frame="windows"],
  .tab-group-container[data-frame="macos"] {
    height: 40px;
    border: none;
    border-radius: 0;
    margin: 0 4px;
    padding-left: 5px;
    padding-right: 0;
    gap: 0;
    background-color: transparent;
  }
  .tab-group-container[data-frame="windows"]::after,
  .tab-group-container[data-frame="macos"]::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--group-color);
    pointer-events: none;
  }
  .tab-group-container[data-frame="windows"] .tab-group-header,
  .tab-group-container[data-frame="macos"] .tab-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    box-sizing: border-box;
    margin: 0 4px 0 0;
    padding: 0 8px 0 6px;
    border: none;
    border-radius: 4px;
    background: color-mix(in srgb, var(--group-color) 25%, transparent);
    color: var(--fg-tab, rgba(255, 255, 255, 0.9));
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
    transition: background-color var(--motion-hover, 0.15s) ease;
  }
  .tab-group-container[data-frame="windows"] .tab-group-header:hover,
  .tab-group-container[data-frame="macos"] .tab-group-header:hover {
    background: color-mix(in srgb, var(--group-color) 38%, transparent);
  }
  :global(.tab-group-container[data-frame="windows"] .w-tab),
  :global(.tab-group-container[data-frame="macos"] .w-tab) {
    background-color: transparent !important;
  }
  :global(.tab-group-container[data-frame="windows"] .w-tab:not(.w-tab--active):hover),
  :global(.tab-group-container[data-frame="macos"] .w-tab:not(.w-tab--active):hover) {
    background-color: var(--bg-tab-hover, rgba(255, 255, 255, 0.08)) !important;
  }
  :global(.tab-group-container[data-frame="windows"] .w-tab--active),
  :global(.tab-group-container[data-frame="macos"] .w-tab--active) {
    background-color: color-mix(in srgb, var(--group-color) 25%, var(--bg-tab-active, rgba(255, 255, 255, 0.08))) !important;
  }

  /* ── Group Dot and Label ──────────────────────────────────────────── */
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

  /* Unloaded (app.autoDiscardTabs) — click reloads it, same as any other tab. */
  .tab-discarded {
    opacity: 0.55;
  }
  .tab-discarded:hover {
    opacity: 0.8;
  }
</style>
