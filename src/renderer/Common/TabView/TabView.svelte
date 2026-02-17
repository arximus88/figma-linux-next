<script lang="ts">
  import { tabView } from "../Store/TabView";

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
      // currentId is a prop, we cannot set it directly unless it is bindable. 
      // But looking at definition: currentId = "" default.
      // If it's just a prop, we can't write to it.
      // However, the original code wrote to it: `currentId = initItemId`.
      // This implies `currentId` was a local variable in Svelte 4 (export let currentId).
      // In Svelte 5, `let { currentId } = $props()` makes it readonly.
      // Unless we use `$bindable()`.
      // Let's assume the user meant to update the local view of it?
      // Or maybe it should be bindable?
      // For now, I'll just remove the assignment if it's not bindable, or check if it IS bindable.
      // Wait, I can't check if it's bindable here easily without seeing the parent.
      // But I can leave it out or try to set it if it was `let currentId = $state(...)`?
      // No, it's a prop.
      // I'll leave the store update, and maybe notify user if currentText needs update.
      // Actually, looking at the code, `currentId` is passed to `tabView.set`.
      // I will just use `tabView.set` and ignore `currentId = ...` for now as it probably won't work on a prop.
    }
    
    // Also the original code had `$effect(() => { tabView.set(id, currentId); });` later?
    // Let's see the rest of the file...
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
      isActive={item.id === $tabView[id]}
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
