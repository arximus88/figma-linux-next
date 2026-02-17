<script lang="ts">
  let {deg = 0, children} = $props();

</script>

<div
  style={`
    --deg: ${deg}deg;
  `}
>
  {@render children?.()}
</div>

<style>
  div {
    display: flex;
    transform: rotate(var(--deg));
  }
</style>
