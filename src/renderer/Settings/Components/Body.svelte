<script lang="ts">
  import { tick } from "svelte";
  import { SECTIONS, searchSettings, type SectionId, type SettingMeta } from "../schema";
  import { saveState } from "../autosave.svelte";
  import SettingsIcon from "./SettingsIcon.svelte";
  import GeneralView from "./Views/GeneralView.svelte";
  import AppearanceView from "./Views/AppearanceView.svelte";
  import TabsView from "./Views/TabsView.svelte";
  import IntegrationsView from "./Views/IntegrationsView.svelte";
  import AdvancedView from "./Views/AdvancedView.svelte";

  let { onCloseSettings }: { onCloseSettings: () => void } = $props();

  const VIEWS = {
    general: GeneralView,
    appearance: AppearanceView,
    tabs: TabsView,
    integrations: IntegrationsView,
    advanced: AdvancedView,
  } satisfies Record<SectionId, unknown>;

  let current = $state<SectionId>("general");
  let query = $state("");
  let searchInput = $state<HTMLInputElement>();
  let content = $state<HTMLElement>();

  let section = $derived(SECTIONS.find((s) => s.id === current) ?? SECTIONS[0]);
  let results = $derived(searchSettings(query));
  const View = $derived(VIEWS[current]);

  let saveText = $derived(
    saveState.status === "saving"
      ? "Saving…"
      : saveState.status === "error"
        ? "Couldn't save the last change"
        : saveState.status === "saved"
          ? "Saved"
          : "Changes save automatically",
  );

  async function open(id: SectionId) {
    current = id;
    await tick();
    content?.scrollTo({ top: 0 });
  }

  /** Go to a search result and flash its row. */
  async function jumpTo(setting: SettingMeta) {
    query = "";
    current = setting.section;
    await tick();
    const row = document.getElementById(`setting-${setting.id}`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.remove("search-target");
    void row.offsetWidth; // restart the flash if it is the same row again
    row.classList.add("search-target");
  }

  function sectionTitle(id: SectionId) {
    return SECTIONS.find((s) => s.id === id)?.title ?? "";
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (e.key === "Escape") {
      if (query) query = "";
      else onCloseSettings();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell" role="dialog" aria-modal="true" aria-labelledby="settings-title">
  <nav class="sidebar" aria-label="Settings sections">
    <h2 id="settings-title" class="app-title">Settings</h2>
    <label class="search">
      <SettingsIcon name="search" size={14} />
      <input
        bind:this={searchInput}
        bind:value={query}
        type="search"
        placeholder="Find a setting"
        aria-label="Find a setting"
        aria-controls="settings-content"
      />
      <kbd>Ctrl K</kbd>
    </label>
    <ul>
      {#each SECTIONS as s (s.id)}
        <li>
          <button
            type="button"
            class="nav-item"
            class:active={!query && current === s.id}
            aria-current={!query && current === s.id ? "page" : undefined}
            onclick={() => {
              query = "";
              open(s.id);
            }}
          >
            <SettingsIcon name={s.id} size={16} />
            {s.title}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="main">
    <header class="main-head">
      <div class="head-text">
        {#if query}
          <h1>Search</h1>
          <p>{results.length} {results.length === 1 ? "setting matches" : "settings match"} "{query}"</p>
        {:else}
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        {/if}
      </div>
      <span class="save-status" class:error={saveState.status === "error"} role="status">{saveText}</span>
      <button type="button" class="close" aria-label="Close settings" onclick={() => onCloseSettings()}>
        <SettingsIcon name="close" size={18} />
      </button>
    </header>

    {#if saveState.pendingRestart.length > 0}
      <div class="restart-banner" role="status">
        <SettingsIcon name="info" size={16} />
        <span>Restart to apply: {saveState.pendingRestart.join(", ")}</span>
        <button type="button" class="s-btn primary" onclick={() => window.figmaApi.send("restartApp")}>
          Restart now
        </button>
      </div>
    {/if}

    <div class="content" id="settings-content" bind:this={content}>
      {#if query}
        {#if results.length === 0}
          <p class="empty">No setting matches "{query}".</p>
        {:else}
          <ul class="results">
            {#each results as r (r.id)}
              <li>
                <button type="button" class="result" onclick={() => jumpTo(r)}>
                  <span class="result-title">{r.title}</span>
                  <span class="result-where">{sectionTitle(r.section)}</span>
                  {#if r.subtitle}<span class="result-sub">{r.subtitle}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <View />
      {/if}
    </div>
  </div>
</div>

<style>
  .shell {
    display: flex;
    width: min(1040px, 94vw);
    height: min(720px, 90vh);
    overflow: hidden;
    border: 1px solid var(--borders);
    border-radius: 12px;
    background: var(--bg-panel);
    color: var(--text);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  }

  /* ── Sidebar ── */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 220px;
    flex-shrink: 0;
    padding: 18px 12px;
    border-right: 1px solid var(--borders);
    background: var(--bg-card);
    box-sizing: border-box;
  }
  .app-title {
    margin: 0 6px;
    font-size: 15px;
    font-weight: 700;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--borders);
    border-radius: 7px;
    background: var(--bg-panel);
    color: var(--text-secondary);
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .search input::-webkit-search-cancel-button {
    display: none;
  }
  kbd {
    padding: 0 4px;
    border: 1px solid var(--borders);
    border-radius: 4px;
    font-family: inherit;
    font-size: 10px;
    color: var(--text-secondary);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .nav-item:hover {
    background: var(--bg-card-hover);
  }
  .nav-item.active {
    background: var(--accent-transparent);
    color: var(--accent);
    font-weight: 600;
  }
  .nav-item:focus-visible,
  .close:focus-visible,
  .result:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* ── Main ── */
  .main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .main-head {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px 28px 14px;
    border-bottom: 1px solid var(--borders);
  }
  .head-text {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 700;
  }
  .head-text p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }
  .save-status {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .save-status.error {
    color: var(--error);
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .close:hover {
    background: var(--bg-card-hover);
  }

  .restart-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 28px;
    font-size: 13px;
    color: var(--warning-text);
    background: var(--warning-muted);
  }
  .restart-banner span {
    flex: 1;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 28px 28px;
  }

  .empty {
    color: var(--text-secondary);
    font-size: 13px;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .result {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--borders);
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .result:hover {
    background: var(--bg-card-hover);
  }
  .result-title {
    font-size: 14px;
  }
  .result-where {
    font-size: 12px;
    color: var(--accent);
  }
  .result-sub {
    grid-column: 1 / -1;
    font-size: 12px;
    color: var(--text-secondary);
  }

  @media (max-width: 720px) {
    .sidebar {
      width: 170px;
    }
    kbd {
      display: none;
    }
  }
</style>
