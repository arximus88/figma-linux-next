<script lang="ts">
  let { frameStyle = "windows" as Types.FrameStyle } = $props();
  import { ButtonWindow, ButtonTool } from "Common/Buttons";
  import { newFileVisible, communityTabVisible, currentTab } from "../store";
  import { onClickHome, onClickNewProject, onClickCommunity } from "./utils";
  import { getFrameConfig } from "Utils/Render/frameConfig";

  const config = $derived(getFrameConfig(frameStyle));
</script>

<div class="panel-left">
  <ButtonWindow
    padding="var(--left-btn-padding)"
    activeBgColor={"var(--bg-tab-hover)"}
    isActive={currentTab.value === "mainTab"}
    onButtonClick={onClickHome}
  >
    <config.left.home.component size={config.left.home.size} />
  </ButtonWindow>

  {#if communityTabVisible.value}
    <ButtonWindow
      padding="var(--left-btn-padding)"
      activeBgColor={"var(--bg-tab-hover)"}
      isActive={currentTab.value === "communityTab"}
      onButtonClick={onClickCommunity}
    >
      <config.left.community.component size={config.left.community.size} />
    </ButtonWindow>
  {/if}

  {#if newFileVisible.value}
    <ButtonTool padding="var(--left-btn-padding)" onButtonClick={onClickNewProject}>
      <config.left.plus.component size={config.left.plus.size} />
    </ButtonTool>
  {/if}
</div>

<style>
  .panel-left {
    display: flex;
    align-items: stretch;
    gap: var(--left-gap, 0px);
    -webkit-app-region: no-drag;
  }
  .panel-left :global(div[role="button"]) {
    border-radius: var(--window-control-radius, 0px);
  }
</style>
