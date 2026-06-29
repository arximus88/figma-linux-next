<script lang="ts">
  import { untrack } from "svelte";
  let { zIndex } = $props();
  import { InputRange, ListBox } from "Common/Input";
  import { Section, Card, SettingRow, Toggle } from "Common";
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

  let copied = $state(false);

  let mcpSnippet = $derived.by(() => {
    const port = $settings.mcp.remoteDebugPort ?? 9222;
    const cdpEnabled = $settings.mcp.cdpEnabled ?? false;
    const cdpEntry =
      cdpEnabled && port > 0
        ? `,\n    "chrome-figma": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:${port}"]\n    }`
        : "";
    return `{\n  "mcpServers": {\n    "figma-linux-next": {\n      "type": "http",\n      "url": "http://127.0.0.1:3845/mcp"\n    }${cdpEntry}\n  }\n}`;
  });

  function copyMcpSnippet() {
    navigator.clipboard.writeText(mcpSnippet).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

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

  <Section title="Developer">
    <div class="grid-2">
      <Card>
        <SettingRow
          title="Enable MCP Write Tools"
          badge="Experimental"
          subtitle="Let AI modify objects in your files · reconnect MCP"
        >
          <Toggle bind:checked={$settings.mcp.enableWriteTools} />
        </SettingRow>
        <SettingRow
          title="Enable Chrome DevTools (CDP)"
          subtitle="Remote debugging for chrome-figma MCP · restart"
        >
          <Toggle bind:checked={$settings.mcp.cdpEnabled} />
        </SettingRow>
        <SettingRow title="CDP port">
          <input
            class="port-input"
            type="number"
            min="1024"
            max="65535"
            bind:value={$settings.mcp.remoteDebugPort}
          />
        </SettingRow>
      </Card>
      <Card>
        <div class="mcp-snippet">
          <div class="mcp-snippet-header">
            <span class="mcp-snippet-title">.mcp.json snippet</span>
            <button class="copy-btn" onclick={copyMcpSnippet}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre class="mcp-snippet-code">{mcpSnippet}</pre>
        </div>
      </Card>
    </div>
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

  /* .mcp.json snippet fills its card */
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
