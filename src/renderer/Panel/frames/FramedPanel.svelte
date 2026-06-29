<script lang="ts">
  import { getFrameStyleVars } from "Utils/Render/frameTheme";
  import FramedLeft from "./FramedLeft.svelte";
  import FramedRight from "./FramedRight.svelte";
  import FramedTabs from "./FramedTabs.svelte";

  let { style, zoom = 1 }: { style: Types.FrameStyle; zoom?: number } = $props();

  // The tab/popup text sizes are global (html) custom properties and differ per
  // frame; set them imperatively so a single panel can serve every style.
  $effect(() => {
    const size = style === "gnome" ? "13px" : "14px";
    const root = document.documentElement.style;
    root.setProperty("--text-size-tab", size);
    root.setProperty("--text-size-tab-view", size);
    root.setProperty("--text-size-popup", size);
  });
</script>

<div id="panel" data-frame={style} style="zoom: {zoom}; {getFrameStyleVars(style)}">
  <FramedLeft {style} />
  <FramedTabs {style} />
  <FramedRight {style} />
</div>

<style>
  #panel {
    display: flex;
    height: 40px;
    -webkit-app-region: drag;
    width: 100%;
    box-sizing: border-box;
  }

  #panel[data-frame="gnome"] {
    background: #2e2e32;
    padding: 0 8px 0 3px;
    gap: 12px;
    align-items: center;
    box-shadow: 0 -1px 0px #424242 inset;
  }
  #panel[data-frame="windows"] {
    background-color: var(--bg-header);
    border-bottom: none;
    padding: 0;
    gap: 0px;
    align-items: stretch;
    border-radius: 0;
    box-shadow: none;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    border: none;
    font-family: "Inter", sans-serif;
    font-size: var(--fontSize);
    font-weight: 400;
  }
</style>
