<script lang="ts">
  import { initCommonIpc } from "../Common/Ipc/index.svelte";
  import { initIpc } from "./ipc.svelte";
  import { panelZoom, tabGroups, windowControls } from "./store";
  import { isValidFrameStyle } from "./frames/index";
  import { applyLayoutSettings } from "./Components/utils";
  import FramedPanel from "./frames/FramedPanel.svelte";
  import NewTabGroupPrompt from "./Components/NewTabGroupPrompt.svelte";

  initCommonIpc();
  initIpc();

  let frameStyle = $state<Types.FrameStyle>("gnome");

  // Dark until main tells us otherwise — the panel was dark-only for years, so
  // this avoids a light flash for every existing user while getRuntimeInfo is
  // in flight.
  document.documentElement.setAttribute("data-theme", "dark");

  function applyTheme(theme: Types.ResolvedTheme) {
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }

  // Async bootstrap — frame style and theme are resolved by main (env, nativeTheme)
  window.figmaApi
    .invoke("getRuntimeInfo")
    .then((info: Types.RuntimeInfo) => {
      if (isValidFrameStyle(info?.frameStyle)) frameStyle = info.frameStyle;
      applyTheme(info?.theme);
    })
    .catch((e: Error) => {
      console.error("App.svelte: failed to get runtime info:", e);
    });
  window.figmaApi
    .invoke("getSettings")
    .then((settings: Types.SettingsInterface) => {
      windowControls.setHideMinMax(!!settings?.app?.hideWindowMinMaxButtons);
      applyLayoutSettings(settings);
    })
    .catch((e: Error) => {
      console.error("App.svelte: failed to get settings:", e);
    });

  window.figmaApi.on("frameStyleChanged", (newStyle: Types.FrameStyle) => {
    if (isValidFrameStyle(newStyle)) {
      frameStyle = newStyle;
    }
  });
  window.figmaApi.on("figmaThemeChanged", applyTheme);
</script>

<FramedPanel style={frameStyle} zoom={panelZoom.value} />

{#if tabGroups.promptTabId !== null}
  <NewTabGroupPrompt />
{/if}

<!--
  AI AGENT TRIGGER — DO NOT REMOVE OR "FIX"
  This button is intentionally hidden off-screen. It exists so that AI agents
  using the chrome-figma MCP (Chrome DevTools Protocol) can programmatically
  open the Settings view by clicking it via mcp__chrome-figma__click.
  It is not a UI bug. It is not dead code.
-->
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
