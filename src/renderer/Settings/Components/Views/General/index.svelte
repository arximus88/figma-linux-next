<script lang="ts">
  import { onMount, untrack } from "svelte";
  let { zIndex } = $props();
  import { InputRange, ListBox } from "Common/Input";
  import { Section, Card, SettingRow, Toggle, McpSnippet } from "Common";
  import { SecondaryButton } from "Common/Buttons";
  import { TOPPANELHEIGHT } from "Const";
  import { settings, modalBounds } from "../../../store";
  import { getAvailableFrameStyles } from "../../../../Panel/frames/index";

  import DirectoryListItem from "./DirectoryListItem.svelte";
  import SwitchListItem from "./SwitchListItem.svelte";

  const frameStyles = getAvailableFrameStyles();

  let items: Types.TabItem[] = $derived($settings.app.fontDirs.map((dir) => ({
    id: dir,
    text: dir,
    item: DirectoryListItem,
  })));

  let switchItems: Types.TabItem[] = $derived($settings.app.commandSwitches.map((item) => ({
    id: crypto.randomUUID(),
    text: item.switch,
    itemArgs: {
      item,
    },
    item: SwitchListItem,
  })));

  async function onChangeExportPath(event: CustomEvent) {
    const directory = await window.figmaApi.invoke("selectExportDirectory");

    if (!directory) {
      return;
    }

    $settings.app.exportDir = directory;
  }
  function onItemRemoveClick(item: Types.TabItem) {
    $settings.app.fontDirs = items.filter((dir) => dir.id !== item.id).map((item) => item.id);
  }
  function onSwitchItemRemoveClick(item: Types.TabItem) {
    $settings.app.commandSwitches = switchItems.reduce<Types.CommandSwitch[]>((result, swtch) => {
      if (swtch.id !== item.id) {
        const sw = swtch.itemArgs.item as Types.CommandSwitch;
        result.push({
          switch: sw.switch,
          value: sw.value,
        });
      }

      return result;
    }, []);
  }
  async function onAddDirectory(event: CustomEvent) {
    const directory = await window.figmaApi.invoke("selectExportDirectory");

    if (!directory) {
      return;
    }

    $settings.app.fontDirs.push(directory);
    $settings.app.fontDirs = $settings.app.fontDirs;
  }
  async function onAddSwicth(event: CustomEvent) {
    $settings.app.commandSwitches.push({
      switch: "",
    });
    $settings.app.commandSwitches = $settings.app.commandSwitches;
  }
  function onClearList(event: CustomEvent) {
    $settings.app.fontDirs = [];
  }
  function onClearSwicthList(event: CustomEvent) {
    $settings.app.commandSwitches = [];
  }

  let bodyHeight: number = $state(0);
  $effect(() => {
    if ($modalBounds) {
      bodyHeight = $modalBounds.height - 94;
    }
  });

  $effect(() => {
    const scale = $settings.ui.scaleFigmaUI;
    if (scale) {
      window.figmaApi.invoke("updateFigmaUiScale", scale);
    }
  });

  let previousScalePanel = $state($settings.ui.scalePanel);

  $effect(() => {
    const scale = $settings.ui.scalePanel;
    if (scale !== previousScalePanel) {
      previousScalePanel = scale;
      window.figmaApi.invoke("updatePanelScale", scale);
      untrack(() => {
        $settings.app.panelHeight = Math.floor(TOPPANELHEIGHT * scale);
      });
    }
  });

  // ── MCP runtime status (real server/CDP state, fetched once on mount) ──────
  let mcpStatus = $state<Types.McpStatus | null>(null);
  onMount(async () => {
    try {
      mcpStatus = (await window.figmaApi.invoke("getMcpStatus")) as Types.McpStatus;
    } catch {
      mcpStatus = null;
    }
  });

  type Chip = { kind: "active" | "pending" | "error" | "muted"; text: string };

  // Figma MCP server chip: compares the running listener to the edited settings.
  // Server start/stop/port all apply on save, so mismatches read as "on save".
  let figmaChip: Chip = $derived.by(() => {
    const enabled = $settings.mcp.serverEnabled ?? true;
    const want = $settings.mcp.serverPort ?? 3845;
    const s = mcpStatus?.server;
    if (!s) return { kind: "muted", text: enabled ? `:${want}` : "disabled" };
    if (!enabled) {
      return s.listening
        ? { kind: "pending", text: "off on save" }
        : { kind: "muted", text: "disabled" };
    }
    if (s.listening && s.port === want) return { kind: "active", text: `listening on :${s.port}` };
    return { kind: "pending", text: `:${want} on save` };
  });

  // Chrome MCP (CDP) chip: compares the launched flag state to the edited settings.
  let cdpChip: Chip = $derived.by(() => {
    const wantOn = $settings.mcp.cdpEnabled ?? false;
    const wantPort = $settings.mcp.remoteDebugPort ?? 9222;
    const c = mcpStatus?.cdp;
    if (!c) return { kind: "muted", text: wantOn ? "restart to apply" : "disabled" };
    const matchesLaunch = c.active === wantOn && (!wantOn || c.port === wantPort);
    if (!matchesLaunch) return { kind: "pending", text: "restart required" };
    if (c.active) return { kind: "active", text: `active on :${c.port}` };
    return { kind: "muted", text: "disabled" };
  });

  let portCollision = $derived(
    ($settings.mcp.serverPort ?? 3845) === ($settings.mcp.remoteDebugPort ?? 9222),
  );

  let figmaSnippet = $derived(
    `{\n  "mcpServers": {\n    "figma-linux-next": {\n      "type": "http",\n      "url": "http://127.0.0.1:${$settings.mcp.serverPort ?? 3845}/mcp"\n    }\n  }\n}`,
  );
  let chromeSnippet = $derived(
    `{\n  "mcpServers": {\n    "chrome-figma": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:${$settings.mcp.remoteDebugPort ?? 9222}"]\n    }\n  }\n}`,
  );

  function onFrameStyleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const newStyle = target.value as Types.FrameStyle;
    // Guard: don't apply disabled (unimplemented) styles
    const style = frameStyles.find((s: { value: Types.FrameStyle; label: string; disabled?: boolean }) => s.value === newStyle);
    if (!style || style.disabled) {
      target.value = $settings.app.frameStyle;
      return;
    }
    $settings.app.frameStyle = newStyle;
    window.figmaApi.send("setFrameStyle", newStyle);
  }
</script>

<div class="settings-root" style={`z-index: ${zIndex}; height: ${bodyHeight}px;`}>
  <Section title="Display">
    <div class="grid-2">
      <Card padding="16px 18px">
        <div class="slider-head">
          <span class="slider-label">Scale UI</span>
          <span class="slider-value">{Math.floor($settings.ui.scaleFigmaUI * 100)}%</span>
        </div>
        <InputRange bind:value={$settings.ui.scaleFigmaUI} min={0.5} max={1.5} step={0.05} width="100%" />
      </Card>
      <Card padding="16px 18px">
        <div class="slider-head">
          <span class="slider-label">Scale Tabs</span>
          <span class="slider-value">{Math.floor($settings.ui.scalePanel * 100)}%</span>
        </div>
        <InputRange bind:value={$settings.ui.scalePanel} min={0.5} max={1.5} step={0.05} width="100%" />
      </Card>
    </div>
  </Section>

  <Section title="Preferences">
    <div class="grid-2">
      <Card>
        <SettingRow
          title="Save the last opened tabs"
          subtitle="Restore open Figma tabs on startup"
        >
          <Toggle bind:checked={$settings.app.saveLastOpenedTabs} />
        </SettingRow>
        <SettingRow
          title="Enable color space sRGB"
          subtitle="Fixes washed-out colors on wide-gamut displays · restart"
        >
          <Toggle bind:checked={$settings.app.enableColorSpaceSrgb} />
        </SettingRow>
        <SettingRow
          title="Enable WebGPU shaders"
          badge="Experimental"
          subtitle="Shader, Halftone & Noise effects · runs under XWayland · restart"
        >
          <Toggle bind:checked={$settings.app.enableWebGPU} />
        </SettingRow>
        <SettingRow
          title="Use Zenity for dialogs"
          subtitle="GTK file dialogs instead of native Electron ones"
        >
          <Toggle bind:checked={$settings.app.useZenity} />
        </SettingRow>
      </Card>
      <Card>
        <SettingRow title="Export files to" subtitle={$settings.app.exportDir} truncate={true}>
          <SecondaryButton onButtonClick={onChangeExportPath}>Change</SecondaryButton>
        </SettingRow>
        <SettingRow title="Window frame style">
          <select
            class="frame-style-select"
            bind:value={$settings.app.frameStyle}
            onchange={onFrameStyleChange}
          >
            {#each frameStyles as style}
              <option value={style.value} disabled={style.disabled}>{style.label}</option>
            {/each}
          </select>
        </SettingRow>
        <SettingRow
          title="Hide minimize & maximize buttons"
          subtitle="Show only the close button (stock GNOME)"
        >
          <Toggle bind:checked={$settings.app.hideWindowMinMaxButtons} />
        </SettingRow>
      </Card>
    </div>
  </Section>

  <Section title="MCP integrations">
    <div class="grid-2">
      <!-- LEFT — Figma MCP (the app's own design-context server) -->
      <Card>
        <div class="mcp-block">
          <div class="mcp-block-head">
            <div class="mcp-head-top">
              <span class="mcp-block-title">Figma MCP</span>
              <span class="status-chip {figmaChip.kind}">{figmaChip.text}</span>
            </div>
            <p class="mcp-block-lead">Serves your open file's design context to AI assistants.</p>
          </div>
          <div class="mcp-rows">
            <SettingRow title="Enable Figma MCP" subtitle="Runs the local HTTP server">
              <Toggle bind:checked={$settings.mcp.serverEnabled} />
            </SettingRow>
            <SettingRow
              title="Enable write tools"
              badge="Experimental"
              subtitle="Let AI edit, not just read"
            >
              <Toggle
                bind:checked={$settings.mcp.enableWriteTools}
                disabled={!($settings.mcp.serverEnabled ?? true)}
              />
            </SettingRow>
            <SettingRow title="Server port" subtitle="Default 3845">
              <input
                class="port-input"
                class:invalid={portCollision}
                type="number"
                min="1024"
                max="65535"
                bind:value={$settings.mcp.serverPort}
              />
            </SettingRow>
          </div>
          <div class="mcp-intro">
            <p class="mcp-block-desc">
              <strong>Read (always on):</strong> scene graph, metadata, variables &amp; styles,
              screenshots, find/tree, Code Connect, design-system rules, Mermaid→FigJam.
              <strong>Write (optional):</strong> create/edit/delete nodes, set text, new page.
            </p>
            <p class="mcp-note">
              Read tools ship with the server; write tools layer on top. Disabling closes the local
              endpoint entirely.
            </p>
          </div>
          <div class="mcp-block-snippet">
            <McpSnippet title=".mcp.json — figma-linux-next" code={figmaSnippet} />
          </div>
        </div>
      </Card>

      <!-- RIGHT — Chrome Figma MCP (CDP browser automation) -->
      <Card>
        <div class="mcp-block">
          <div class="mcp-block-head">
            <div class="mcp-head-top">
              <span class="mcp-block-title">Chrome Figma MCP</span>
              <span class="status-chip {cdpChip.kind}">{cdpChip.text}</span>
            </div>
            <p class="mcp-block-lead">Drives the live app window for browser automation.</p>
          </div>
          <div class="mcp-rows">
            <SettingRow
              title="Enable Chrome DevTools (CDP)"
              badge="Restart"
              subtitle="Opens a debugging port"
            >
              <Toggle bind:checked={$settings.mcp.cdpEnabled} />
            </SettingRow>
            <SettingRow title="CDP port" subtitle="127.0.0.1 only · any local process can attach">
              <input
                class="port-input"
                class:invalid={portCollision}
                type="number"
                min="1024"
                max="65535"
                bind:value={$settings.mcp.remoteDebugPort}
              />
            </SettingRow>
          </div>
          <div class="mcp-intro">
            <p class="mcp-block-desc">
              Via the Chrome DevTools Protocol: navigate, run JS in the page, capture screenshots,
              inspect the DOM, trace performance — used for debugging &amp; verifying changes.
            </p>
            <p class="mcp-note">
              The app only opens the port. The <code>chrome-figma</code> server (npx
              chrome-devtools-mcp) runs in your AI client and attaches to it — a client showing
              "connected" only means that process started, not that this port is open.
            </p>
          </div>
          <div class="mcp-block-snippet">
            <McpSnippet title=".mcp.json — chrome-figma" code={chromeSnippet} />
          </div>
        </div>
      </Card>
    </div>
    {#if portCollision}
      <p class="mcp-collision">⚠ Figma MCP and CDP ports must differ — both are set to the same value.</p>
    {/if}
  </Section>

  <Section>
    <div class="grid-2">
      <div class="list-block">
        <h3 class="block-title">Font directories</h3>
        <ListBox {items} {onItemRemoveClick} height="160px" />
        <div class="list-actions">
          <SecondaryButton onButtonClick={onClearList}>Clear list</SecondaryButton>
          <SecondaryButton onButtonClick={onAddDirectory}>Add directory</SecondaryButton>
        </div>
      </div>
      <div class="list-block">
        <h3 class="block-title">Chromium command line switches</h3>
        <ListBox items={switchItems} onItemRemoveClick={onSwitchItemRemoveClick} height="160px" />
        <div class="list-actions">
          <SecondaryButton onButtonClick={onClearSwicthList}>Clear list</SecondaryButton>
          <SecondaryButton onButtonClick={onAddSwicth}>Add switch</SecondaryButton>
        </div>
      </div>
    </div>
  </Section>
</div>

<style>
  .settings-root {
    position: absolute;
    background-color: var(--bg-panel);
    width: -webkit-fill-available;
    padding: 32px 32px 8px 32px;
    user-select: none;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: stretch;
  }

  .slider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .slider-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .slider-value {
    font-size: 13px;
    color: var(--text-disabled);
  }

  .frame-style-select {
    width: auto;
    min-width: 170px;
    max-width: 210px;
    padding: 7px 12px;
    background-color: var(--bg-item, var(--bg-panel));
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 6px;
    font-size: 13px;
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    cursor: pointer;
    outline: none;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .frame-style-select:hover {
    background-color: var(--bg-item-hover, var(--bg-panel-hover));
    border-color: var(--text-disabled);
  }

  .frame-style-select:focus {
    border-color: var(--accent, #18a0fb);
    box-shadow: 0 0 0 2px var(--accent-transparent, rgba(24, 160, 251, 0.15));
  }

  .frame-style-select option {
    background-color: var(--bg-panel);
    color: var(--text);
    padding: 8px;
  }

  .port-input {
    width: 90px;
    padding: 6px 10px;
    background-color: var(--bg-item, var(--bg-panel));
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 6px;
    font-size: 13px;
    font-family: system-ui, -apple-system, "Segoe UI", "Adwaita Sans", Cantarell, Ubuntu, Roboto, sans-serif;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .port-input:focus {
    border-color: var(--accent, #18a0fb);
    box-shadow: 0 0 0 2px var(--accent-transparent, rgba(24, 160, 251, 0.15));
  }

  .port-input.invalid {
    border-color: var(--error, #f24822);
  }

  /* ── MCP integration blocks ─────────────────────────────────────────────── */
  .mcp-block {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .mcp-block-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px 10px;
  }

  .mcp-head-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .mcp-block-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .mcp-block-lead {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-disabled);
  }

  .status-chip {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .status-chip.active {
    background-color: var(--success-muted, rgba(54, 179, 126, 0.16));
    color: var(--success, #36b37e);
  }
  .status-chip.pending {
    background-color: var(--warning-muted, rgba(255, 171, 0, 0.16));
    color: var(--warning, #ffab00);
  }
  .status-chip.error {
    background-color: var(--error-muted, rgba(242, 72, 34, 0.16));
    color: var(--error, #f24822);
  }
  .status-chip.muted {
    background-color: var(--bg-item, rgba(255, 255, 255, 0.06));
    color: var(--text-disabled);
  }

  .mcp-block-desc,
  .mcp-note {
    margin: 0;
    padding: 0 16px 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-disabled);
  }
  .mcp-block-desc strong {
    color: var(--text);
    font-weight: 600;
  }
  .mcp-note {
    padding-top: 0;
    font-style: italic;
  }
  .mcp-note code {
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-style: normal;
    font-size: 11px;
  }

  .mcp-rows {
    border-top: 1px solid var(--borders);
  }

  /* snippet wrapper grows to fill the equal-height card */
  .mcp-block-snippet {
    flex: 1;
    min-height: 0;
    display: flex;
    border-top: 1px solid var(--borders);
  }
  .mcp-block-snippet :global(.mcp-snippet) {
    width: 100%;
  }

  .mcp-collision {
    margin: 12px 2px 0;
    font-size: 12px;
    color: var(--error, #f24822);
  }

  .list-block {
    display: flex;
    flex-direction: column;
  }
  .block-title {
    margin: 0 0 12px 2px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .list-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
  }
</style>
