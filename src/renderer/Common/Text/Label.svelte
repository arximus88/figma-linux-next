<script lang="ts">
  let {padding = "0 0 20px 0", children} = $props();

</script>

<span
  style={`
    --padding: ${padding}
  `}
>
  {@render children?.()}
</span>

<style>
  span {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-active);
    padding: var(--padding);
  }
</style>
