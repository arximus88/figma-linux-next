<script lang="ts">
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { initIpc } from "./ipc.svelte";
  import { panelZoom } from "./store";
  import { getFramePanel, isValidFrameStyle } from "./frames/index";

  initCommonIpc();
  initIpc();

  let frameStyle = $state<Types.FrameStyle>("gnome");
  let FramePanel = $derived(getFramePanel(frameStyle));

  // Async bootstrap — load saved frame style
  window.figmaApi.invoke("getSettings").then((settings: Types.SettingsInterface) => {
    if (settings?.app?.frameStyle && isValidFrameStyle(settings.app.frameStyle)) {
      frameStyle = settings.app.frameStyle;
    }
  }).catch((e: Error) => {
    console.error("App.svelte: failed to get settings:", e);
  });

  window.figmaApi.on("frameStyleChanged", (newStyle: Types.FrameStyle) => {
    if (isValidFrameStyle(newStyle)) {
      frameStyle = newStyle;
    }
  });
</script>

<FramePanel zoom={panelZoom.value} />
<button
  class="ai-trigger"
  aria-label="Open Settings (AI)"
  data-ai-action="open-settings"
  onclick={() => window.figmaApi.send("openSettingsView")}
></button>

<style>
  .ai-trigger {
    position: fixed;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
    border: none;
    background: none;
    padding: 0;
  }
</style>
