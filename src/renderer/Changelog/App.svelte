<script lang="ts">
  import { CHANGELOG_HTML, CURRENT_VERSION } from "./_data";

  // Follow Figma's theme like the panel and Settings do. Dark until main
  // answers, matching the panel's boot default so the two never disagree.
  document.documentElement.setAttribute("data-theme", "dark");
  window.figmaApi
    .invoke("getRuntimeInfo")
    .then((info: Types.RuntimeInfo) => {
      if (info?.theme === "light" || info?.theme === "dark") {
        document.documentElement.setAttribute("data-theme", info.theme);
      }
    })
    .catch(() => {});

  function closeChangelog(): void {
    window.figmaApi.send("closeChangelogView");
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) closeChangelog();
  }

  function handleBodyClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const link = target?.closest("a[data-url]") as HTMLAnchorElement | null;
    if (link) {
      event.preventDefault();
      const url = link.getAttribute("data-url");
      if (url) window.figmaApi.send("openExternal", url);
    }
  }
</script>

<div role="presentation" class="overlay" onmousedown={handleOverlayMouseDown}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Release notes">
    <header class="header">
      <div class="title-block">
        <h1>What's new</h1>
        {#if CURRENT_VERSION}<span class="current-version">v{CURRENT_VERSION}</span>{/if}
      </div>
      <button class="close" aria-label="Close" onclick={closeChangelog}>✕</button>
    </header>

    <div class="body" onclick={handleBodyClick} role="presentation">
      {@html CHANGELOG_HTML}
    </div>
  </div>
</div>

<style>
  :global(html) { background-color: transparent !important; }
  :global(body) {
    background-color: rgba(0, 0, 0, 0.5);
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
  }

  .overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .modal {
    display: flex;
    flex-direction: column;
    width: min(820px, 92vw);
    height: min(82vh, 800px);
    background: var(--bg-panel);
    border: 1px solid var(--borders);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    border-bottom: 1px solid var(--borders);
    background: var(--bg-header);
  }
  .title-block {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--fg-header);
  }
  .current-version {
    font-size: 13px;
    color: var(--text-disabled);
  }
  .close {
    background: transparent;
    border: none;
    color: var(--fg-header);
    cursor: pointer;
    font-size: 16px;
    padding: 6px 10px;
    border-radius: 4px;
  }
  .close:hover { background: var(--bg-header-control-hover); }

  .body {
    overflow-y: auto;
    padding: 18px 22px 28px;
    line-height: 1.55;
    font-size: 13.5px;
  }
  .body::-webkit-scrollbar { width: 10px; }
  .body::-webkit-scrollbar-thumb {
    background: var(--borders);
    border-radius: 6px;
  }

  .body :global(.entry) {
    padding: 14px 0 18px;
    border-bottom: 1px solid var(--borders);
  }
  .body :global(.entry:last-child) { border-bottom: none; }

  .body :global(h2) {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .body :global(.version) { color: var(--text-active); }
  .body :global(.date) {
    font-size: 12px;
    color: var(--text-disabled);
    font-weight: 400;
  }

  .body :global(h3.section) {
    margin: 12px 0 4px;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-disabled);
  }
  .body :global(h3.section-added) { color: var(--changelog-added); }
  .body :global(h3.section-fixed) { color: var(--changelog-fixed); }
  .body :global(h3.section-removed) { color: var(--changelog-removed); }
  .body :global(h3.section-dependencies),
  .body :global(h3.section-ci-cd),
  .body :global(h3.section-refactor) { color: var(--changelog-refactor); }

  .body :global(ul) {
    margin: 0 0 6px;
    padding-left: 20px;
  }
  .body :global(li) { margin: 4px 0; }
  .body :global(strong) {
    color: var(--text-active);
    font-weight: 600;
  }
  .body :global(code) {
    background: var(--bg-card);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .body :global(a.cl-link) {
    color: var(--bg-toolbar-active);
    cursor: pointer;
    text-decoration: none;
  }
  .body :global(a.cl-link:hover) { text-decoration: underline; }
  .body :global(.empty) {
    text-align: center;
    color: var(--text-disabled);
    margin: 40px 0;
  }
</style>
