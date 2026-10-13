<script lang="ts">
  import { setContext } from "svelte";
  import { SETTING_ROW_LABEL } from "./context";

  interface RowSetting {
    id: string;
    title: string;
    subtitle?: string;
  }

  let {
    /** Schema entry (Settings/schema.ts): title, help text and the row's id. */
    setting = undefined as RowSetting | undefined,
    title = undefined as string | undefined,
    /** Overrides the schema's help text — for live values like a path. */
    subtitle = undefined as string | undefined,
    badge = "",
    badgeKind = "accent" as "accent" | "warning",
    /** Several badges, e.g. Experimental + Restart. */
    badges = [] as { text: string; kind?: "accent" | "warning" }[],
    truncate = false,
    children,
  } = $props();

  let shownTitle = $derived(title ?? setting?.title ?? "");
  let allBadges = $derived(badge ? [{ text: badge, kind: badgeKind }, ...badges] : badges);
  let shownSubtitle = $derived(subtitle ?? setting?.subtitle ?? "");

  // The control in the row is named after the row: a Toggle reads this as its
  // accessible label, so a screen reader hears "Tab previews on hover, switch"
  // instead of a dozen identical "Toggle setting"s.
  setContext(SETTING_ROW_LABEL, () => shownTitle);
</script>

<div class="setting-row" id={setting ? `setting-${setting.id}` : undefined}>
  <div class="text">
    <span class="title">
      {shownTitle}
      {#each allBadges as b (b.text)}<span class="badge {b.kind ?? 'accent'}">{b.text}</span>{/each}
    </span>
    {#if shownSubtitle}
      <span class="subtitle" class:truncate>{shownSubtitle}</span>
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
    color: var(--text-secondary);
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
  .badge.warning {
    background-color: var(--warning-muted);
    color: var(--warning-text);
  }

  /* A search result jumped here: flash the row so the eye finds it. */
  .setting-row:global(.search-target) {
    animation: search-flash 1.6s ease-out;
  }
  @keyframes search-flash {
    0%,
    30% {
      background-color: var(--accent-transparent);
    }
    100% {
      background-color: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .setting-row:global(.search-target) {
      animation: none;
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
  }
</style>
