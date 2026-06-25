<script lang="ts">
  import { untrack } from "svelte";
  let { zIndex } = $props();
  import { InputRange, CheckBox, InputText, ListBox } from "Common/Input";
  import { Text, Label, Flex, FlexItem, Line } from "Common";
  import { ButtonTool, SecondaryButton } from "Common/Buttons";
  import { TOPPANELHEIGHT } from "Const";
  import { Folder } from "Common/Icons";
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
  <Flex>
    <Flex der="column" width="-webkit-fill-available">
      <Label>Scale UI</Label>
      <InputRange bind:value={$settings.ui.scaleFigmaUI} min={0.5} max={1.5} step={0.05} />
      <Flex der="column" alignItems="center" justifyContent="center">
        <Text padding="8px 0 0 0">{Math.floor($settings.ui.scaleFigmaUI * 100)}%</Text>
      </Flex>
    </Flex>
    <Flex width="120px" />
    <Flex der="column" width="-webkit-fill-available">
      <Label>Scale Tabs</Label>
      <InputRange bind:value={$settings.ui.scalePanel} min={0.5} max={1.5} step={0.05} />
      <Flex der="column" alignItems="center" justifyContent="center">
        <Text padding="8px 0 0 0">{Math.floor($settings.ui.scalePanel * 100)}%</Text>
      </Flex>
    </Flex>
  </Flex>

  <Flex height="50px" />
  <Line />
  <Flex height="40px" />

  <Flex>
    <Flex der="column" width="-webkit-fill-available">
      <Label>Main settings</Label>
      <CheckBox
        bind:checked={$settings.app.saveLastOpenedTabs}
        text="Save the last opened tabs"
        description="Restore previously open Figma tabs when the app starts."
      />
      <CheckBox
        bind:checked={$settings.app.enableColorSpaceSrgb}
        text="Enable color space sRGB"
        description="Forces sRGB color profile. Useful if colors look washed out on wide-gamut displays. Requires restart."
      />
      <CheckBox
        bind:checked={$settings.app.enableWebGPU}
        text="Enable WebGPU shaders"
        badge="Experimental"
        description="Enables Figma's Shader, Halftone and Noise effects (WebGPU↔GL interop). Runs the app under XWayland (ozone=x11), so native Wayland features like fractional scaling and per-monitor DPI are lost while enabled. Requires restart."
      />
      <CheckBox
        bind:checked={$settings.app.useZenity}
        text="Use Zenity for Dialogs"
        description="Use Zenity (GTK dialog tool) instead of native Electron dialogs for file open/save prompts."
      />

      <Flex height="16px" />
      <Label>Window Frame Style</Label>
      <select
        class="frame-style-select"
        bind:value={$settings.app.frameStyle}
        onchange={onFrameStyleChange}
      >
        {#each frameStyles as style}
          <option value={style.value} disabled={style.disabled}>{style.label}</option>
        {/each}
      </select>

      <Flex height="16px" />
      <Label>MCP Server</Label>
      <CheckBox
        bind:checked={$settings.mcp.enableWriteTools}
        text="Enable MCP Write Tools"
        badge="Experimental"
        description="Allow AI assistants to create and modify objects in your Figma files. Disabled by default — LLMs can make unintended changes. Requires MCP client reconnect."
      />
      <CheckBox
        bind:checked={$settings.mcp.cdpEnabled}
        text="Enable Chrome DevTools Protocol (CDP)"
        description="Enables remote debugging on the port below. Required for chrome-figma MCP in Claude Code. Requires restart."
      />

      <Flex height="12px" />
      <div class="port-row">
        <span class="port-label">CDP Port</span>
        <input
          class="port-input"
          type="number"
          min="1024"
          max="65535"
          bind:value={$settings.mcp.remoteDebugPort}
        />
      </div>
    </Flex>
    <Flex width="120px" />
    <Flex der="column" width="-webkit-fill-available">
      <Label>Export files to</Label>
      <Flex>
        <FlexItem grow={1}>
          <InputText bind:value={$settings.app.exportDir}>
            <ButtonTool normalBgColor="tarsparent" onButtonClick={onChangeExportPath}>
              <Folder color="var(--text)" size="18" />
            </ButtonTool>
          </InputText>
        </FlexItem>
        <Flex width="20px" />
        <SecondaryButton onButtonClick={onChangeExportPath}>Change</SecondaryButton>
      </Flex>
    </Flex>
  </Flex>

  <Flex height="24px" />
  <Label>Claude Code MCP — .mcp.json</Label>
  <Flex height="8px" />
  <div class="mcp-snippet">
    <div class="mcp-snippet-header">
      <span class="mcp-snippet-title">Copy into your project's .mcp.json → mcpServers</span>
      <button class="copy-btn" onclick={copyMcpSnippet}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
    <pre class="mcp-snippet-code">{mcpSnippet}</pre>
  </div>

  <Flex height="50px" />
  <Line />
  <Flex height="40px" />

  <Flex>
    <Flex der="column" width="-webkit-fill-available">
      <Label>Font directories</Label>
      <ListBox {items} {onItemRemoveClick} height="160px" />
      <Flex height="10px" />
      <Flex>
        <FlexItem grow={1} />
        <SecondaryButton onButtonClick={onClearList}>Clear list</SecondaryButton>
        <Flex width="10px" />
        <SecondaryButton onButtonClick={onAddDirectory}>Add directory</SecondaryButton>
      </Flex>
    </Flex>
    <Flex width="120px" />
    <Flex der="column" width="-webkit-fill-available">
      <Label>Chromium command line switches</Label>
      <ListBox items={switchItems} onItemRemoveClick={onSwitchItemRemoveClick} height="160px" />
      <Flex height="10px" />
      <Flex>
        <FlexItem grow={1} />
        <SecondaryButton onButtonClick={onClearSwicthList}>Clear list</SecondaryButton>
        <Flex width="10px" />
        <SecondaryButton onButtonClick={onAddSwicth}>Add Switch</SecondaryButton>
      </Flex>
    </Flex>
  </Flex>
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

  .frame-style-select {
    width: 100%;
    padding: 8px 12px;
    margin-top: 8px;
    background-color: var(--bg-item, var(--bg-panel));
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 6px;
    font-size: 14px;
    font-family: "Inter", sans-serif;
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

  .port-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }

  .port-label {
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }

  .port-input {
    width: 110px;
    padding: 6px 10px;
    background-color: var(--bg-item, var(--bg-panel));
    color: var(--text);
    border: 1px solid var(--borders);
    border-radius: 6px;
    font-size: 13px;
    font-family: "Inter", sans-serif;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .port-input:focus {
    border-color: var(--accent, #18a0fb);
    box-shadow: 0 0 0 2px var(--accent-transparent, rgba(24, 160, 251, 0.15));
  }

  .mcp-snippet {
    margin-top: 12px;
    border: 1px solid var(--borders);
    border-radius: 6px;
    overflow: hidden;
  }

  .mcp-snippet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background-color: var(--bg-item, var(--bg-panel));
    border-bottom: 1px solid var(--borders);
  }

  .mcp-snippet-title {
    font-size: 11px;
    color: var(--text-disabled);
    font-family: "Inter", sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .copy-btn {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--borders);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-family: "Inter", sans-serif;
    transition: background-color 0.15s ease;
  }

  .copy-btn:hover {
    background-color: var(--bg-item-hover, rgba(255, 255, 255, 0.06));
  }

  .mcp-snippet-code {
    margin: 0;
    padding: 12px;
    font-size: 11px;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    color: var(--text);
    background-color: var(--bg-panel);
    line-height: 1.6;
    white-space: pre;
    overflow-x: auto;
    tab-size: 2;
  }
</style>
