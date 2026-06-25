<script lang="ts">
  let { padding = "0", children } = $props();
</script>

<div class="card" style={`--card-padding: ${padding};`}>
  {@render children?.()}
</div>

<style>
  .card {
    background: var(--bg-card, var(--bg-item));
    border: 1px solid var(--borders);
    border-radius: 12px;
    overflow: hidden;
    padding: var(--card-padding);
    height: 100%;
    box-sizing: border-box;
  }

  /* Drop the trailing divider of the last row inside the card */
  .card > :global(.setting-row:last-child) {
    border-bottom: none;
  }
</style>
