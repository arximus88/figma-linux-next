<script lang="ts">
  import { SettingRow, Toggle, McpSnippet } from "Common";
  import { isValidPort } from "Utils/Common/settingsEdit";
  import { settings } from "../../store";
  import { saveState } from "../../autosave.svelte";
  import { SETTINGS } from "../../schema";
  import SettingsIcon from "../SettingsIcon.svelte";
  import McpToolList from "../McpToolList.svelte";

  // ── Live status of both services ─────────────────────────────────────────
  // Re-read after every save: the server starts, stops and rebinds live, and a
  // rebind finishes a moment after the save returns, hence the second read.
  let status = $state<Types.McpStatus | null>(null);
  let agentStatus = $state<Types.FigmaAgentStatus | null>(null);
  function readStatus() {
    window.figmaApi
      .invoke("getFigmaAgentStatus")
      .then((s: Types.FigmaAgentStatus) => {
        agentStatus = s;
      })
      .catch(() => {
        agentStatus = null;
      });
    window.figmaApi
      .invoke("getMcpStatus")
      .then((s: Types.McpStatus) => {
        status = s;
      })
      .catch(() => {
        status = null;
      });
  }
  $effect(() => {
    void saveState.revision;
    readStatus();
    const later = setTimeout(readStatus, 600);
    return () => clearTimeout(later);
  });

  type Chip = { kind: "active" | "pending" | "error" | "muted"; text: string };

  let serverPortValid = $derived(isValidPort($settings.mcp.serverPort));
  let cdpPortValid = $derived(isValidPort($settings.mcp.remoteDebugPort));
  let portCollision = $derived($settings.mcp.serverPort === $settings.mcp.remoteDebugPort);

  let serverChip: Chip = $derived.by(() => {
    const enabled = $settings.mcp.serverEnabled !== false;
    const want = $settings.mcp.serverPort;
    const s = status?.server;
    // Main refuses to save these, so the server keeps its current port.
    if (enabled && (!serverPortValid || portCollision)) return { kind: "error", text: "Port not saved" };
    if (!s) return { kind: "muted", text: enabled ? `:${want}` : "Off" };
    if (!enabled) return s.listening ? { kind: "pending", text: "Stopping…" } : { kind: "muted", text: "Off" };
    if (s.listening && s.port === want) return { kind: "active", text: `Listening on :${s.port}` };
    return { kind: "pending", text: `Starting on :${want}…` };
  });

  // CDP is a Chromium launch switch: it changes only with a restart.
  let cdpChip: Chip = $derived.by(() => {
    const wantOn = !!$settings.mcp.cdpEnabled;
    const c = status?.cdp;
    if (!c) return { kind: "muted", text: wantOn ? "Restart to open" : "Off" };
    const matches = c.active === wantOn && (!wantOn || c.port === $settings.mcp.remoteDebugPort);
    if (!matches) return { kind: "pending", text: "Restart required" };
    return c.active ? { kind: "active", text: `Open on :${c.port}` } : { kind: "muted", text: "Off" };
  });

  // The listener binds live like the MCP server; the port is fixed by figma.com's page.
  let agentChip: Chip = $derived.by(() => {
    const enabled = $settings.app.figmaAgentEnabled === true;
    const s = agentStatus;
    if (!s) return { kind: "muted", text: enabled ? "Starting…" : "Off" };
    if (!enabled) return s.listening ? { kind: "pending", text: "Stopping…" } : { kind: "muted", text: "Off" };
    if (s.listening) return { kind: "active", text: `Listening on :${s.port}` };
    if (s.portInUse) return { kind: "error", text: `Port ${s.port} in use` };
    return { kind: "pending", text: `Starting on :${s.port}…` };
  });

  // ── Access token (issue #94) ─────────────────────────────────────────────
  // Main owns the token: it is created there the first time it is asked for
  // and never travels back in a settings save. Shown masked; Copy and the
  // snippets' Copy buttons put the real value on the clipboard.
  let authOn = $derived($settings.mcp.requireAuth === true);
  let token = $state("");
  let tokenShown = $state(false);
  let tokenCopied = $state(false);
  let regenerating = $state(false);
  $effect(() => {
    if (!authOn || token) return;
    window.figmaApi
      .invoke("getMcpAuthToken")
      .then((t: string) => {
        token = t;
      })
      .catch(() => {});
  });
  function copyToken() {
    navigator.clipboard.writeText(token).then(() => {
      tokenCopied = true;
      setTimeout(() => (tokenCopied = false), 2000);
    });
  }
  async function regenerateToken() {
    regenerating = true;
    try {
      token = await window.figmaApi.invoke("regenerateMcpAuthToken");
    } finally {
      regenerating = false;
    }
  }

  let mcpUrl = $derived(`http://127.0.0.1:${$settings.mcp.serverPort}/mcp`);
  function figmaJson(secret: string): string {
    const headers = authOn
      ? `,\n      "headers": {\n        "Authorization": "Bearer ${secret}"\n      }`
      : "";
    return `{\n  "mcpServers": {\n    "figma-linux-next": {\n      "type": "http",\n      "url": "${mcpUrl}"${headers}\n    }\n  }\n}`;
  }
  function claudeCommand(secret: string): string {
    const header = authOn ? ` \\\n  --header "Authorization: Bearer ${secret}"` : "";
    return `claude mcp add --transport http figma-linux-next ${mcpUrl}${header}`;
  }
  let shownSecret = $derived(tokenShown ? token : "•".repeat(12));
  let figmaSnippet = $derived(figmaJson(shownSecret));
  let figmaSnippetCopy = $derived(figmaJson(token));
  let claudeSnippet = $derived(claudeCommand(shownSecret));
  let claudeSnippetCopy = $derived(claudeCommand(token));
  let chromeSnippet = $derived(
    `{\n  "mcpServers": {\n    "chrome-figma": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:${$settings.mcp.remoteDebugPort}"]\n    }\n  }\n}`,
  );

  // A cleared number input binds as null; keep that out of the saved value.
  function portValue(e: Event): number {
    const n = (e.currentTarget as HTMLInputElement).valueAsNumber;
    return Number.isNaN(n) ? 0 : n;
  }
</script>

<section class="settings-group">
  <h3 class="settings-group-title">
    Local services <span class="settings-group-note">Bound to 127.0.0.1 only</span>
  </h3>

  <div class="settings-card">
    <div class="service-head" id={`setting-${SETTINGS.mcpServer.id}`}>
      <div class="service-text">
        <span class="service-title">
          <SettingsIcon name="integrations" size={16} />
          {SETTINGS.mcpServer.title}
          <span class="s-chip {serverChip.kind}" role="status">{serverChip.text}</span>
        </span>
        <span class="service-desc">{SETTINGS.mcpServer.subtitle}</span>
      </div>
      <Toggle bind:checked={$settings.mcp.serverEnabled} label={SETTINGS.mcpServer.title} />
    </div>
    <SettingRow setting={SETTINGS.mcpWrite} badge="Experimental">
      <Toggle
        bind:checked={$settings.mcp.enableWriteTools}
        disabled={$settings.mcp.serverEnabled === false}
      />
    </SettingRow>
    <SettingRow setting={SETTINGS.mcpAi} badges={[{ text: "Experimental" }, { text: "Uses AI credits", kind: "warning" }]}>
      <Toggle
        bind:checked={$settings.mcp.enableAiTools}
        disabled={$settings.mcp.serverEnabled === false}
      />
    </SettingRow>
    <SettingRow setting={SETTINGS.mcpAuth}>
      <Toggle
        bind:checked={$settings.mcp.requireAuth}
        disabled={$settings.mcp.serverEnabled === false}
      />
    </SettingRow>
    {#if authOn}
      <div class="token-row">
        <code class="s-mono token-value" aria-label="Access token">{token ? shownSecret : "…"}</code>
        <button class="s-btn" onclick={() => (tokenShown = !tokenShown)} disabled={!token}>
          {tokenShown ? "Hide" : "Show"}
        </button>
        <button class="s-btn" onclick={copyToken} disabled={!token}>
          {tokenCopied ? "Copied!" : "Copy"}
        </button>
        <button class="s-btn" onclick={regenerateToken} disabled={regenerating}>Regenerate</button>
      </div>
      <p class="s-hint token-hint">
        Clients send it as <code class="s-mono">Authorization: Bearer &lt;token&gt;</code>.
        Regenerating cuts off every client that has the old one.
      </p>
    {/if}
    <SettingRow setting={SETTINGS.mcpPort}>
      <input
        class="s-input port"
        type="number"
        min="1024"
        max="65535"
        aria-label={SETTINGS.mcpPort.title}
        aria-invalid={!serverPortValid || portCollision}
        value={$settings.mcp.serverPort}
        oninput={(e) => ($settings.mcp.serverPort = portValue(e))}
      />
    </SettingRow>
    <details class="service-details">
      <summary><SettingsIcon name="chevron" size={14} />Connection details</summary>
      <p class="s-hint">
        Read tools are always on: scene graph, metadata, variables and styles, screenshots,
        comments, versions, Code Connect, design-system rules, Mermaid to FigJam. Editing tools add
        create, edit and delete. Figma AI tools drive Figma's own AI and spend your credits.
      </p>
      <McpSnippet
        title=".mcp.json — figma-linux-next"
        code={figmaSnippet}
        copyCode={figmaSnippetCopy}
      />
      <McpSnippet title="Claude Code" code={claudeSnippet} copyCode={claudeSnippetCopy} />
    </details>
    <details class="service-details" id={`setting-${SETTINGS.mcpTools.id}`}>
      <summary><SettingsIcon name="chevron" size={14} />{SETTINGS.mcpTools.title}</summary>
      <p class="s-hint">{SETTINGS.mcpTools.subtitle}</p>
      <McpToolList writeOn={$settings.mcp.enableWriteTools} aiOn={$settings.mcp.enableAiTools === true} />
    </details>
  </div>

  <div class="settings-card">
    <div class="service-head" id={`setting-${SETTINGS.cdp.id}`}>
      <div class="service-text">
        <span class="service-title">
          <SettingsIcon name="appearance" size={16} />
          {SETTINGS.cdp.title}
          <span class="badge-restart">Restart</span>
          <span class="s-chip {cdpChip.kind}" role="status">{cdpChip.text}</span>
        </span>
        <span class="service-desc">{SETTINGS.cdp.subtitle}</span>
      </div>
      <Toggle bind:checked={$settings.mcp.cdpEnabled} label={SETTINGS.cdp.title} />
    </div>
    <SettingRow setting={SETTINGS.cdpPort}>
      <input
        class="s-input port"
        type="number"
        min="1024"
        max="65535"
        aria-label={SETTINGS.cdpPort.title}
        aria-invalid={!cdpPortValid || portCollision}
        value={$settings.mcp.remoteDebugPort}
        oninput={(e) => ($settings.mcp.remoteDebugPort = portValue(e))}
      />
    </SettingRow>
    <details class="service-details">
      <summary><SettingsIcon name="chevron" size={14} />Connection details</summary>
      <p class="s-hint">
        The app only opens the port. The <code class="s-mono">chrome-figma</code> server runs in
        your AI client and attaches to it, so a client showing "connected" only means that process
        started, not that this port is open.
      </p>
      <McpSnippet title=".mcp.json — chrome-figma" code={chromeSnippet} />
    </details>
  </div>

  <div class="settings-card">
    <div class="service-head" id={`setting-${SETTINGS.browserHandoff.id}`}>
      <div class="service-text">
        <span class="service-title">
          <SettingsIcon name="general" size={16} />
          {SETTINGS.browserHandoff.title}
          <span class="s-chip {agentChip.kind}" role="status">{agentChip.text}</span>
        </span>
        <span class="service-desc">{SETTINGS.browserHandoff.subtitle}</span>
      </div>
      <Toggle bind:checked={$settings.app.figmaAgentEnabled} label={SETTINGS.browserHandoff.title} />
    </div>
    <details class="service-details">
      <summary><SettingsIcon name="chevron" size={14} />How to turn it on in the browser</summary>
      <p class="s-hint">
        Open any file on figma.com, then <b>Main menu → Preferences → Open links in desktop app</b>;
        <b>Open in desktop app</b> in the same menu does it once. Chrome 142 and newer first ask to
        allow <i>local network access</i> for figma.com; the link that triggers that prompt stays in
        the browser, the next one opens here. The same account must be signed in here.
      </p>
      <p class="s-hint">
        This is the address Figma's page probes for the official helper, so the port cannot change.
        Only requests from figma.com are answered, and only figma.com links are opened.
      </p>
      <p class="s-hint">
        <b>figma-agent-linux</b> (local fonts for figma.com in a browser) uses the same port. With
        both, whichever starts first gets it; if this app does, the browser loses your local fonts.
      </p>
    </details>
  </div>

  {#if portCollision}
    <p class="s-error" role="alert">The two ports must differ. Neither change is saved until they do.</p>
  {:else if !serverPortValid || !cdpPortValid}
    <p class="s-error" role="alert">Ports must be between 1024 and 65535. The old value is kept.</p>
  {/if}
</section>

<style>
  .service-head {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--borders);
  }
  .service-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .service-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .service-desc {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .badge-restart {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--warning-muted);
    color: var(--warning-text);
  }
  .service-details {
    padding: 10px 16px 14px;
  }
  .token-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px 0;
  }
  .token-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: all;
  }
  .token-hint {
    padding: 6px 16px 12px;
    margin: 0;
    border-bottom: 1px solid var(--borders);
  }
  .service-details summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    list-style: none;
  }
  .service-details summary::-webkit-details-marker {
    display: none;
  }
  .service-details summary :global(svg) {
    transition: transform 0.15s ease;
  }
  .service-details[open] summary :global(svg) {
    transform: rotate(90deg);
  }
  .service-details :global(.mcp-snippet) {
    margin-top: 10px;
    border: 1px solid var(--borders);
    border-radius: 8px;
    overflow: hidden;
  }
</style>
