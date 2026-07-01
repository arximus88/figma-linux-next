<script lang="ts">
  import { ButtonTool, ButtonWindow } from "Common/Buttons";
  import { getFrameConfig } from "Utils/Render/frameTheme";
  import { onClickCommunity, onClickHome, onClickNewProject } from "../Components/utils";
  import { communityTabVisible, currentTab, newFileVisible } from "../store";

  let { style }: { style: Types.FrameStyle } = $props();

  const cfg = $derived(getFrameConfig(style));
  // Gnome's new-file button is a ButtonWindow (round), Windows uses ButtonTool.
  const usesToolPlus = $derived(style !== "gnome");
  const btn = $derived(
    style === "gnome"
      ? { padding: "0", active: "rgba(255,255,255,0.12)", hover: "rgba(255,255,255,0.08)" }
      : { padding: "0 10px", active: "rgba(255,255,255,0.15)", hover: "rgba(255,255,255,0.1)" },
  );

  const Home = $derived(cfg.left.home.component);
  const CommunityIcon = $derived(cfg.left.community.component);
  const Plus = $derived(cfg.left.plus.component);
</script>

<div class="left">
  <ButtonWindow
    padding={btn.padding}
    activeBgColor={btn.active}
    hoverBgColor={btn.hover}
    isActive={currentTab.value === "mainTab"}
    onButtonClick={onClickHome}
  >
    <Home size={cfg.left.home.size} />
  </ButtonWindow>

  {#if communityTabVisible.value}
    <ButtonWindow
      padding={btn.padding}
      activeBgColor={btn.active}
      hoverBgColor={btn.hover}
      isActive={currentTab.value === "communityTab"}
      onButtonClick={onClickCommunity}
    >
      <CommunityIcon size={cfg.left.community.size} />
    </ButtonWindow>
  {/if}

  {#if newFileVisible.value}
    {#if usesToolPlus}
      <ButtonTool padding={btn.padding} onButtonClick={onClickNewProject}>
        <Plus size={cfg.left.plus.size} />
      </ButtonTool>
    {:else}
      <ButtonWindow padding={btn.padding} hoverBgColor={btn.hover} onButtonClick={onClickNewProject}>
        <Plus size={cfg.left.plus.size} />
      </ButtonWindow>
    {/if}
  {/if}
</div>

<style>
  .left {
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }

  :global([data-frame="gnome"]) .left {
    gap: 12px;
  }
  :global([data-frame="windows"]) .left {
    gap: 0px;
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
