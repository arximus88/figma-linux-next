<script lang="ts">
  /**
   * What the Figma MCP server offers, by tier, with each tool's own
   * description: the text an AI assistant reads to decide when to call it.
   * Comes from main (tools/definitions.ts), so it cannot drift from the server.
   */
  let {
    writeOn = false,
    aiOn = false,
  }: { writeOn?: boolean; aiOn?: boolean } = $props();

  let tools = $state<Types.McpToolList | null>(null);
  $effect(() => {
    window.figmaApi
      .invoke("getMcpTools")
      .then((t: Types.McpToolList) => {
        tools = t;
      })
      .catch(() => {
        tools = null;
      });
  });

  let groups = $derived(
    tools
      ? [
          { id: "read", title: "Reading", note: "always on", on: true, list: tools.read },
          { id: "write", title: "Editing", note: writeOn ? "on" : "off", on: writeOn, list: tools.write },
          { id: "ai", title: "Figma AI", note: aiOn ? "on, uses AI credits" : "off", on: aiOn, list: tools.ai },
        ].filter((g) => g.list.length > 0)
      : [],
  );
</script>

{#if groups.length}
  <div class="tool-groups">
    {#each groups as g (g.id)}
      <div class="tool-group" class:off={!g.on}>
        <div class="group-title">{g.title} <span class="group-note">{g.list.length} · {g.note}</span></div>
        <ul>
          {#each g.list as t (t.name)}
            <li>
              <code>{t.name}</code>
              <span class="desc">{t.description}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{:else}
  <p class="s-hint">The tool list is not available.</p>
{/if}

<style>
  .tool-groups {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 10px;
  }
  .group-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 6px;
  }
  .group-note {
    font-weight: 400;
    color: var(--text-secondary);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  code {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .desc {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
  }
  .tool-group.off code {
    color: var(--text-secondary);
  }
</style>
