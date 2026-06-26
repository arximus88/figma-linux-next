<script lang="ts">
  let { title = "", children } = $props();
</script>

<section class="settings-section">
  {#if title}<h3 class="section-title">{title}</h3>{/if}
  {@render children?.()}
</section>

<style>
  .settings-section {
    margin-bottom: 32px;
  }
  .section-title {
    margin: 0 0 14px 2px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }
</style>
