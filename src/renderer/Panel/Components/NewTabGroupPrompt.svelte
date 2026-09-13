<script lang="ts">
  import { TAB_GROUP_COLORS } from "Const";
  import { tabGroups } from "../store";

  let label = $state("");
  let color = $state(TAB_GROUP_COLORS[0]);
  let inputEl: HTMLInputElement | undefined;

  function reset() {
    label = "";
    color = TAB_GROUP_COLORS[0];
  }

  function close() {
    reset();
    tabGroups.closePrompt();
  }

  function create() {
    const tabId = tabGroups.promptTabId;
    const trimmed = label.trim();
    if (tabId === null || !trimmed) return;

    window.figmaApi.send("createTabGroupWithTab", { tabId, label: trimmed, color });
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    if (e.key === "Enter") create();
  }

  // The bar covers the whole panel strip (see .bar), so autofocus is the only
  // way in — there's no separate dialog chrome a pointer could land on first.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!--
  Note: the Panel is only a ~40px toolbar strip — everything below it is a
  separate WebContentsView (the active tab) painted on top, so a centered
  modal would render entirely hidden behind the tab. This bar replaces the
  panel row in place instead, staying inside that strip's height.
-->
<div class="bar" role="none">
  <input
    bind:this={inputEl}
    use:focusOnMount
    class="name-input"
    type="text"
    placeholder="Group name"
    bind:value={label}
  />
  <div class="colors" role="radiogroup" aria-label="Group color">
    {#each TAB_GROUP_COLORS as c}
      <button
        type="button"
        class="swatch"
        class:selected={c === color}
        style="--swatch-color: {c}"
        role="radio"
        aria-checked={c === color}
        aria-label="Color {c}"
        onclick={() => (color = c)}
      ></button>
    {/each}
  </div>
  <div class="actions">
    <button type="button" class="btn" onclick={close}>Cancel</button>
    <button type="button" class="btn btn-primary" disabled={!label.trim()} onclick={create}>
      Create
    </button>
  </div>
</div>

<style>
  .bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 40px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    box-sizing: border-box;
    background: var(--bg-toolbar);
    color: var(--fg-toolbar);
    -webkit-app-region: no-drag;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    max-width: 240px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--borders);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    outline: none;
  }
  .colors {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--swatch-color);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }
  .swatch.selected {
    border-color: var(--fg-toolbar);
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;
  }
  .btn {
    padding: 4px 10px;
    border: 1px solid var(--borders);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-primary {
    border-color: var(--bg-primary-btn);
    background: var(--bg-primary-btn);
    color: #ffffff;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
