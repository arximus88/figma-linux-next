<script lang="ts">
  import { ButtonWindow } from "Common/Buttons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { tabSlide } from "../Components/motion";
  import { onClickCommunity, onClickHome } from "../Components/utils";
  import { communityTabVisible, currentTab, layout, newFileVisible } from "../store";
  import NewTabButton from "./NewTabButton.svelte";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  // Colours resolve through the frame palette so they follow light/dark.
  const btn = $derived(
    style === "gnome"
      ? { padding: "0", active: "var(--frame-btn-active)", hover: "var(--frame-btn-hover)" }
      : style === "kde"
        ? { padding: "0", active: "var(--frame-tab-active)", hover: "var(--frame-tab-hover)" }
        : { padding: "0 10px", active: "var(--frame-btn-active)", hover: "var(--frame-btn-hover)" },
  );

  const Home = $derived(cfg.left.home.component);
  const CommunityIcon = $derived(cfg.left.community.component);
</script>

<div class="left">
  <ButtonWindow
    padding={btn.padding}
    activeBgColor={btn.active}
    hoverBgColor={btn.hover}
    isActive={currentTab.value === "mainTab"}
    onButtonClick={onClickHome}
  >
    <Home size={cfg.left.home.size} color="currentColor" />
  </ButtonWindow>

  {#if communityTabVisible.value}
    <span class="slot" transition:tabSlide>
      <ButtonWindow
        padding={btn.padding}
        activeBgColor={btn.active}
        hoverBgColor={btn.hover}
        isActive={currentTab.value === "communityTab"}
        onButtonClick={onClickCommunity}
      >
        <CommunityIcon size={cfg.left.community.size} color="currentColor" />
      </ButtonWindow>
    </span>
  {/if}

  {#if newFileVisible.value && !layout.newTabAfterTabs}
    <span class="slot" transition:tabSlide>
      <NewTabButton {style} />
    </span>
  {/if}
</div>

<style>
  .left {
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }
  /* Real boxes (not display: contents) so the open/close transition has a
     width to fold. They stretch to the row so the buttons inside keep their
     own height rules. */
  .slot {
    display: flex;
    align-items: center;
    align-self: stretch;
  }

  :global([data-frame="gnome"]) .left {
    gap: 12px;
  }
  :global([data-frame="windows"]) .left {
    gap: 0px;
  }
  /* KDE: Home/Community behave like tabs (flat, accent underline when active);
     the new-file "+" is a round control like the ones on the right. */
  :global([data-frame="kde"]) .left {
    gap: 4px;
  }
  :global([data-frame="kde"]) .left :global(div[role="button"]) {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 3px 3px 0 0;
  }
  :global([data-frame="kde"]) .left :global(div[role="button"].button__active::before) {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    border-radius: 3px 3px 0 0;
    background-color: var(--frame-accent);
  }
  :global([data-frame="gnome"]) .left :global(div[role="button"]) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
  /* Buttons stretch to full panel height in Windows style */
  :global([data-frame="windows"]) .left :global(div[role="button"]) {
    border-radius: 0px;
    width: auto;
    height: 40px;
  }
</style>
