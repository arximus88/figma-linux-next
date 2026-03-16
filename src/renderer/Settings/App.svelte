<script lang="ts">
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { initIpc } from "./ipc";
  import { settings } from "./store";

  import Body from "./Components/Body.svelte";

  initCommonIpc();
  initIpc();

  let pallet = $state<string[]>([]);

  $effect(() => {
    const theme = $settings.app.figmaTheme ?? "dark";
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  });

  function closeSettings() {
    settings.trim();
    window.figmaApi.send("closeSettingsView", $settings);
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeSettings();
    }
  }
</script>

<div role="presentation" onmousedown={handleOverlayMouseDown} id="settings" style={pallet.join("; ")}>
  <Body onCloseSettings={closeSettings} />
</div>

<style>
  :global(html) {
    background-color: transparent !important;
  }
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
