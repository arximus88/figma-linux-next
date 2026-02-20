<script lang="ts">
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { getFrameStyleVars } from "Utils/Render/frameStyles";
  import { themeApp } from "../Common/Store/Themes";
  import { initIpc } from "./ipc.svelte";
  import { panelZoom } from "./store";
  import Left from "./Components/Left.svelte";
  import Right from "./Components/Right.svelte";
  import Tabs from "./Components/Tabs.svelte";

  initCommonIpc();
  initIpc();

  let pallet = $state<string[]>([]);
  let frameStyle = $state<Types.FrameStyle>("gnome");
  let frameStyleVars = $state(getFrameStyleVars("gnome"));

  // Async bootstrap — replaces sendSync("getSettings")
  window.figmaApi.invoke("getSettings").then((settings: Types.SettingsInterface) => {
    if (settings?.app?.frameStyle) {
      frameStyle = settings.app.frameStyle as Types.FrameStyle;
    }
    if (!frameStyle || !["windows", "gnome", "macos", "kde"].includes(frameStyle)) {
      frameStyle = "gnome";
    }
    frameStyleVars = getFrameStyleVars(frameStyle);
  }).catch((e: Error) => {
    console.error("App.svelte: failed to get settings:", e);
  });


  window.figmaApi.on("frameStyleChanged", (newStyle: Types.FrameStyle) => {
    frameStyle = newStyle;
    if (!["windows", "gnome", "macos", "kde"].includes(frameStyle)) {
      frameStyle = "gnome";
    }
    frameStyleVars = getFrameStyleVars(frameStyle);
  });
</script>

<div
  id="panel"
  data-frame-style={frameStyle}
  style={`zoom: ${panelZoom.value}; ${pallet.join("; ")}; ${frameStyleVars}`}
>
  <Left {frameStyle} />
  <Tabs {frameStyle} />
  <Right {frameStyle} />
</div>

<style>
  #panel {
    display: flex;
    height: var(--panel-height, 40px);
    background-color: var(--panel-bg, var(--bg-header));
    border-bottom: var(--panel-border-bottom, none);
    padding: var(--panel-padding, 0);
    gap: var(--panel-gap, 0px);
    align-items: var(--panel-align-items, stretch);
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
