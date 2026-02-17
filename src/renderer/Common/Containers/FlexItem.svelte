<script lang="ts">
  let {grow = 0, flex = 0, children = undefined} = $props();

</script>

<div
  style={`
    flex: ${flex};
    flex-grow: ${grow};
  `}
>
  {@render children?.()}
</div>
