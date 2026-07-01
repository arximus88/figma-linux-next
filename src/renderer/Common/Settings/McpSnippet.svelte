<script lang="ts">
  /** A copyable .mcp.json snippet block with its own Copy button + state. */
  let { title, code }: { title: string; code: string } = $props();

  let copied = $state(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }
</script>

<div class="mcp-snippet">
  <div class="mcp-snippet-header">
    <span class="mcp-snippet-title">{title}</span>
    <button class="copy-btn" onclick={copy}>{copied ? "Copied!" : "Copy"}</button>
  </div>
  <pre class="mcp-snippet-code">{code}</pre>
</div>

<style>
  .mcp-snippet {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .mcp-snippet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background-color: var(--bg-card-hover, var(--bg-item));
    border-bottom: 1px solid var(--borders);
  }

  .mcp-snippet-title {
    font-size: 11px;
    color: var(--text-disabled);
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .copy-btn {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--borders);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    transition: background-color 0.15s ease;
  }

  .copy-btn:hover {
    background-color: var(--bg-item-hover, rgba(255, 255, 255, 0.06));
  }

  .mcp-snippet-code {
    flex: 1;
    margin: 0;
    padding: 14px;
    font-size: 11px;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    color: var(--text);
    background-color: transparent;
    line-height: 1.6;
    white-space: pre;
    overflow-x: auto;
    tab-size: 2;
  }
</style>
