<script lang="ts">
  import { ipcRenderer } from "electron";
  import { themeApp } from "../Common/Store/Themes";
  import { initCommonIpc } from "../Common/Ipc";
  import { getColorPallet } from "Utils/Render/themes";
  import { getFrameStyleVars } from "Utils/Render/frameStyles";
  import { initIpc } from "./ipc";
  import { panelZoom } from "./store";
  import { Left, Right, Tabs } from "./Components";

  initCommonIpc();
  initIpc();

  let pallet: string[] = [];
  let frameStyle: Types.FrameStyle = "gnome";
  let frameStyleVars: string = "";

  // Get frame style from settings
  const settings: Types.SettingsInterface = ipcRenderer.sendSync("getSettings");
  if (settings?.app?.frameStyle) {
    frameStyle = settings.app.frameStyle;
  }
  frameStyleVars = getFrameStyleVars(frameStyle);

  themeApp.subscribe((theme) => {
    if (!theme) {
      return;
    }
    pallet = getColorPallet(theme);
  });

  // Listen for frame style changes
  ipcRenderer.on("frameStyleChanged", (_, newStyle: Types.FrameStyle) => {
    frameStyle = newStyle;
    frameStyleVars = getFrameStyleVars(newStyle);
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
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    border: none;

    --text-size-tab: 14px;
    --text-size-tab-view: 14px;
    --text-size-popup: 14px;
    /* --fontSize: 16px;
    --fontSubtitleSize: 18px;
    --fontTitleSize: 22px; */

    font-family: "Inter", sans-serif;
    font-size: var(--fontSize);
    font-weight: 400;
  }
</style>
