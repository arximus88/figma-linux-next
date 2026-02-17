<script lang="ts">
  let {bgColor = "var(--bg-header)", children} = $props();

</script>

<div
  style={`
    --bg-color: ${bgColor};
  `}
>
  {@render children?.()}
</div>

<style>
  div {
    display: flex;
    align-items: center;
    background-color: var(--bg-color);
  }
</style>
