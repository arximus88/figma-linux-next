<script lang="ts">
  let {gap = "", width = "auto", height = "auto", padding = "inherit", columns = "auto", rows = "auto", columnGap: _columnGap = "auto", rowGap: _rowGap = "auto", areas = "auto", children} = $props();

  let rowGap = $derived(gap ? gap : _rowGap);
  let columnGap = $derived(gap ? gap : _columnGap);
</script>

<div
  style={`
    --width: ${width};
    --height: ${height};
    --padding: ${padding};
    --columns: ${columns};
    --rows: ${rows};
    --areas: ${areas};
    --grid-column-gap: ${columnGap};
    --grid-row-gap: ${rowGap};
  `}
>
  {@render children?.()}
</div>

<style>
  div {
    display: grid;
    grid-template-columns: var(--columns);
    grid-template-rows: var(--rows);
    grid-template-areas: var(--areas);
    grid-column-gap: var(--grid-column-gap);
    grid-row-gap: var(--grid-row-gap);
    width: var(--width);
    height: var(--height);
    padding: var(--padding);
  }
</style>
