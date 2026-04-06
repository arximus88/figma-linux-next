<script lang="ts">
  let { items = $bindable([]), width = "auto", height = "auto", border = "1px solid var(--borders)", padding = "8px 8px 8px 16px", bradius = "3px", onItemClick = (item: Types.TabItem) => {}, onItemRemoveClick = (item: Types.TabItem) => {} } = $props();

</script>

<div
  style={`
  --width: ${width};
  --height: ${height};
  --border: ${border};
  --padding: ${padding};
  --bradius: ${bradius};
`}
>
  {#each items as item (item.id)}
    {@const Item = item.item}
    <Item
      text={item.text}
      {...item.itemArgs}
      disabled={item.disabled}
      onItemRemoveClick={() => {
        onItemRemoveClick(item);
      }}
      onItemClick={() => {
        onItemClick(item);
      }}
    />
  {/each}
</div>

<style>
  div {
    display: flex;
    flex-direction: column;
    border: var(--border);
    border-radius: var(--bradius);
    padding: var(--padding);
    width: var(--width);
    height: var(--height);
    overflow-x: auto;
    overflow-y: auto;
  }
</style>
