<script lang="ts">
  import { SettingRow, Toggle, McpSnippet } from "Common";
  import { isValidPort } from "Utils/Common/settingsEdit";
  import { settings } from "../../store";
  import { saveState } from "../../autosave.svelte";
  import { SETTINGS } from "../../schema";
  import SettingsIcon from "../SettingsIcon.svelte";

  // ── Live status of both services ─────────────────────────────────────────
  // Re-read after every save: the server starts, stops and rebinds live, and a
  // rebind finishes a moment after the save returns, hence the second read.
  let status = $state<Types.McpStatus | null>(null);
  function readStatus() {
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

  let figmaSnippet = $derived(
    `{\n  "mcpServers": {\n    "figma-linux-next": {\n      "type": "http",\n      "url": "http://127.0.0.1:${$settings.mcp.serverPort}/mcp"\n    }\n  }\n}`,
  );
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
        Read tools are always on: scene graph, metadata, variables and styles, screenshots, Code
        Connect, design-system rules, Mermaid to FigJam. Editing tools add create, edit and delete.
      </p>
      <McpSnippet title=".mcp.json — figma-linux-next" code={figmaSnippet} />
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
