<script lang="ts">
  import { tabView } from "../Store/TabView/index.svelte";

  let {
    items = [],
    currentId = $bindable(""),
    initItemId = undefined,
    padding = "inherit",
    flexDirection = "row",
    normalFgColor = "var(--fg-header)",
    normalBgColor = "inherit",
    onItemClick = (item: Types.TabItem) => {},
  } = $props();

  const id = $derived(items.map((i) => i.id).join("."));

  $effect(() => {
    if (initItemId) {
      tabView.set(id, initItemId);
    }
  });

  $effect(() => { tabView.set(id, currentId); });
</script>

<div
  role="tablist"
  tabindex="0"
  style={`
    --padding: ${padding};
    --flex-direction: ${flexDirection};
    --normal-bg-color: ${normalBgColor};
    --normal-fg-color: ${normalFgColor};
  `}
>
  {#each items as item (item.id)}
    {@const Item = item.item}
    <Item
      isActive={item.id === tabView.value[id]}
      text={item.text}
      {...item.itemArgs}
      onmouseup={() => {
        currentId = item.id;
        tabView.set(id, item.id);
        onItemClick(item);
      }}
    />
  {/each}
</div>

<style>
  div {
    display: flex;
    flex-direction: var(--flex-direction);
    background-color: var(--normal-bg-color);
    color: var(--normal-fg-color);
    padding: var(--padding);
  }
</style>
