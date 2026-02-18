<script lang="ts">
  import { untrack } from "svelte";
  let { zIndex } = $props();
  import { randomUUID } from "crypto";
  import { ipcRenderer } from "electron";
  import { InputRange, CheckBox, InputText, ListBox } from "Common/Input";
  import { Text, Label, Flex, FlexItem, Line } from "Common";
  import { ButtonTool, SecondaryButton } from "Common/Buttons";
  import { TOPPANELHEIGHT } from "Const";
  import { Folder } from "Common/Icons";
  import { settings, modalBounds } from "../../../store";
  import { getAvailableFrameStyles } from "Utils/Render/frameStyles";

  import DirectoryListItem from "./DirectoryListItem.svelte";
  import SwitchListItem from "./SwitchListItem.svelte";

  const frameStyles = getAvailableFrameStyles();

  let items: Types.TabItem[] = $derived($settings.app.fontDirs.map((dir) => ({
    id: dir,
    text: dir,
    item: DirectoryListItem,
  })));

  let switchItems: Types.TabItem[] = $derived($settings.app.commandSwitches.map((item) => ({
    id: randomUUID(),
    text: item.switch,
    itemArgs: {
      item,
    },
    item: SwitchListItem,
  })));

  async function onChangeExportPath(event: CustomEvent) {
    const directory = await ipcRenderer.invoke("selectExportDirectory");

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
    const directory = await ipcRenderer.invoke("selectExportDirectory");

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
      ipcRenderer.invoke("updateFigmaUiScale", scale);
    }
  });

  let previousScalePanel = $state($settings.ui.scalePanel);

  $effect(() => {
    const scale = $settings.ui.scalePanel;
    if (scale !== previousScalePanel) {
      previousScalePanel = scale;
      ipcRenderer.invoke("updatePanelScale", scale);
      untrack(() => {
        $settings.app.panelHeight = Math.floor(TOPPANELHEIGHT * scale);
      });
    }
  });

  function onFrameStyleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const newStyle = target.value as Types.FrameStyle;
    $settings.app.frameStyle = newStyle;

    // Notify panel to update frame style
    ipcRenderer.send("frameStyleChanged", newStyle);
  }
</script>

<div style={`z-index: ${zIndex}; height: ${bodyHeight}px;`}>
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
      <CheckBox bind:checked={$settings.app.saveLastOpenedTabs} text="Save the last opened tabs" />
      <CheckBox bind:checked={$settings.app.enableColorSpaceSrgb} text="Enable color space sRGB" />
      <CheckBox bind:checked={$settings.app.visibleNewProjectBtn} text="Show new project button" />
      <CheckBox bind:checked={$settings.app.useZenity} text="Use Zenity for Dialogs" />




      <Flex height="16px" />
      <Label>Window Frame Style</Label>
      <select
        class="frame-style-select"
        bind:value={$settings.app.frameStyle}
        onchange={onFrameStyleChange}
      >
        {#each frameStyles as style}
          <option value={style.value}>{style.label}</option>
        {/each}
      </select>
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
  div {
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
    background-color: var(--bg-item);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    font-family: "Inter", sans-serif;
    cursor: pointer;
    outline: none;
    transition: all 0.2s ease;
  }

  .frame-style-select:hover {
    background-color: var(--bg-item-hover);
    border-color: var(--border-hover);
  }

  .frame-style-select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-transparent);
  }

  .frame-style-select option {
    background-color: var(--bg-panel);
    color: var(--text);
    padding: 8px;
  }
</style>
