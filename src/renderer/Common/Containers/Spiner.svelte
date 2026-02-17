<script lang="ts">
  let {spin = false, children} = $props();

</script>

<div class={spin ? "spin" : ""}>
  {@render children?.()}
</div>

<style>
  div {
    display: flex;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .spin {
    animation-name: spin;
    animation-duration: 1000ms;
    animation-iteration-count: infinite;
    animation-timing-function: linear;
  }
</style>
