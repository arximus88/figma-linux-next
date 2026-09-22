<script lang="ts">
  import { TAB_GROUP_COLORS } from "Const";

  /**
   * The tab-group popover. Lives in its own WebContentsView
   * (Main/Ui/TabGroupPromptView), anchored just under the tab or group chip
   * that triggered it — see the module doc there for why a separate view is
   * required at all (the panel is only the top ~40px of the window; anything
   * it drew below that would be hidden behind the active tab's view).
   *
   * Two modes, same card: `create` names a new group around a tab and sends
   * `createTabGroupWithTab` ({ tabId, label, color }); `edit` renames/recolors
   * an existing one and sends `updateTabGroup` ({ groupId, label, color }).
   * Both seed their fields from the payload. Cancel, Escape, and losing focus
   * to the panel or tab behind the popover (main's TabGroupPromptView hides
   * on webContents "blur") all close it with no side effects — this renderer
   * only needs to tell main "I'm done" via `closeTabGroupPrompt` so the next
   * show() starts from a clean slate.
   */

  let data = $state<Types.TabGroupPromptPayload | null>(null);
  let label = $state("");
  let color = $state(TAB_GROUP_COLORS[0]);

  const isEdit = $derived(data?.mode === "edit");

  window.figmaApi.on("tabGroupPromptData", (payload: Types.TabGroupPromptPayload) => {
    data = payload;
    label = payload.label ?? "";
    color = payload.color ?? TAB_GROUP_COLORS[0];
    document.documentElement.setAttribute("data-theme", payload.theme);
  });

  function close() {
    window.figmaApi.send("closeTabGroupPrompt");
  }

  function submit() {
    const trimmed = label.trim();
    if (!data || !trimmed) return;

    if (data.mode === "edit") {
      if (data.groupId === undefined) return;
      window.figmaApi.send("updateTabGroup", { groupId: data.groupId, label: trimmed, color });
    } else {
      if (data.tabId === undefined) return;
      window.figmaApi.send("createTabGroupWithTab", { tabId: data.tabId, label: trimmed, color });
    }
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    if (e.key === "Enter") submit();
  }

  // The popover view takes OS focus the moment it's shown (see
  // TabGroupPromptView.show); autofocus is the only way into the input from
  // there — there's no prior pointer position to land on first. When editing,
  // preselect the existing name so typing replaces it.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    if (node.value) node.select();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if data}
  {#key `${data.mode}-${data.groupId ?? data.tabId}`}
    <div class="card" data-frame={data.frame}>
      <input
        use:focusOnMount
        class="name-input"
        type="text"
        placeholder="Name this group"
        bind:value={label}
      />
      <div class="colors" role="radiogroup" aria-label="Group color">
        {#each TAB_GROUP_COLORS as c (c)}
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
      <div class="divider"></div>
      <div class="actions">
        <button type="button" class="btn" onclick={close}>Cancel</button>
        <button type="button" class="btn btn-primary" disabled={!label.trim()} onclick={submit}>
          {isEdit ? "Save" : "Create"}
        </button>
      </div>
    </div>
  {/key}
{/if}

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: transparent;
    overflow: hidden;
  }
  :global(body) {
    /* Matches CARD_PAD_* in Utils/Main/tabGroupPrompt.ts: room for the shadow. */
    padding: 4px 12px 16px;
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    user-select: none;
  }

  .card {
    width: 240px;
    box-sizing: border-box;
    padding: 14px;
    background: var(--bg-panel);
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 12px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
    animation: card-in 120ms cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  /* Breeze popovers are square-ish with a thin frame; the Windows chrome is softer. */
  .card[data-frame="kde"] {
    border-radius: 3px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .card[data-frame="windows"],
  .card[data-frame="macos"] {
    border-radius: 8px;
  }

  .name-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 32px;
    margin-bottom: 12px;
    padding: 0 10px;
    border: 1px solid var(--borders);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 13px;
    outline: none;
  }
  .name-input:focus {
    border-color: var(--bg-primary-btn);
  }

  .colors {
    display: flex;
    align-items: center;
    height: 20px;
    gap: 8px;
    margin-bottom: 14px;
  }
  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--swatch-color);
    border: 2px solid transparent;
    outline-offset: 2px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }
  .swatch.selected {
    border-color: var(--text);
  }

  .divider {
    height: 1px;
    margin-bottom: 14px;
    background: var(--borders);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    height: 28px;
  }
  .btn {
    padding: 0 12px;
    height: 28px;
    border: 1px solid var(--borders);
    border-radius: 6px;
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

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
</style>
