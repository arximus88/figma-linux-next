<script lang="ts">
  import { themeApp } from "../Common/Store/Themes";
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { initIpc } from "./ipc";
  import { settings } from "./store";

  import Body from "./Components/Body.svelte";

  initCommonIpc();
  initIpc();

  let pallet = $state<string[]>([]);

  function onCloseModalHandler(event: MouseEvent) {
    if (event.target === event.currentTarget) {
        settings.trim();
        window.figmaApi.send("closeSettingsView", $settings);
    }
  }
</script>

<div role="presentation" onmousedown={onCloseModalHandler} id="settings" style={pallet.join("; ")}>
  <Body onCloseSettings={onCloseModalHandler} />
</div>

<style>
  :global(body) {
    background-color: rgba(0, 0, 0, 0.5);
  }
  div {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
