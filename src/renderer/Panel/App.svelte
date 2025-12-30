<script lang="ts">
  import { ipcRenderer } from "electron";
  import { initCommonIpc } from "../Common/Ipc";
  import { getColorPallet } from "Utils/Render/themes";
  import { getFrameStyleVars } from "Utils/Render/frameStyles";
  import { themeApp } from "../Common/Store/Themes";
  import { initIpc } from "./ipc";
  import { panelZoom } from "./store";
  import Left from "./Components/Left.svelte";
  import Right from "./Components/Right.svelte";
  import Tabs from "./Components/Tabs.svelte";

  initCommonIpc();
  initIpc();

  let pallet: string[] = [];
  let frameStyle: Types.FrameStyle = "gnome";
  let frameStyleVars: string = "";

  try {
    const settings: Types.SettingsInterface = ipcRenderer.sendSync("getSettings");
    if (settings?.app?.frameStyle) {
      frameStyle = settings.app.frameStyle;
    }
  } catch (e) {
    console.error("App.svelte: failed to get settings sync:", e);
  }

  if (!frameStyle || !["windows", "gnome", "macos"].includes(frameStyle)) {
    frameStyle = "gnome";
  }
  frameStyleVars = getFrameStyleVars(frameStyle);

  themeApp.subscribe((theme) => {
    if (!theme) {
      return;
    }
    pallet = getColorPallet(theme);
  });

  ipcRenderer.on("frameStyleChanged", (_, newStyle: Types.FrameStyle) => {
    frameStyle = newStyle;
    if (!["windows", "gnome", "macos"].includes(frameStyle)) {
      frameStyle = "gnome";
    }
    frameStyleVars = getFrameStyleVars(frameStyle);
  });
</script>

<div id="panel" style={`zoom: ${$panelZoom}; ${pallet.join("; ")}; ${frameStyleVars}`}>
  <Left />
  <Tabs />
  <Right />
</div>

<style>
  #panel {
    display: flex;
    height: var(--panel-height, 40px);
    background-color: var(--panel-bg, var(--bg-header));
    border-bottom: var(--panel-border-bottom, none);
    -webkit-app-region: drag;
    width: 100%;
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    border: none;

    --text-size-tab: 14px;
    --text-size-tab-view: 14px;
    --text-size-popup: 14px;

    font-family: "Inter", sans-serif;
    font-size: var(--fontSize);
    font-weight: 400;
  }
</style>
