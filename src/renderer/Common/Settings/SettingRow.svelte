<script lang="ts">
  let {
    title,
    subtitle = "",
    badge = "",
    truncate = false,
    children,
  } = $props();
</script>

<div class="setting-row">
  <div class="text">
    <span class="title">
      {title}
      {#if badge}<span class="badge">{badge}</span>{/if}
    </span>
    {#if subtitle}
      <span class="subtitle" class:truncate>{subtitle}</span>
    {/if}
  </div>
  <div class="control">
    {@render children?.()}
  </div>
</div>

<style>
  .setting-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    min-height: 52px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--borders);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text);
  }

  .subtitle {
    font-size: 12px;
    color: var(--text-disabled);
    line-height: 1.4;
  }
  .subtitle.truncate {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .control {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background-color: var(--accent-muted, rgba(24, 160, 251, 0.15));
    color: var(--accent, #18a0fb);
  }
</style>
