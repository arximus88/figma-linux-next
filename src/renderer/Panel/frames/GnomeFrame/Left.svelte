<script lang="ts">
  import { ButtonWindow, ButtonTool } from "Common/Buttons";
  import { GnomeFigma, GnomePlus, Community } from "Icons";
  import { newFileVisible, communityTabVisible, currentTab } from "../../store";
  import { onClickHome, onClickNewProject, onClickCommunity } from "../../Components/utils";
</script>

<div class="left">
  <ButtonWindow
    padding="0"
    activeBgColor="rgba(255,255,255,0.12)"
    hoverBgColor="rgba(255,255,255,0.08)"
    isActive={currentTab.value === "mainTab"}
    onButtonClick={onClickHome}
  >
    <GnomeFigma size="16" />
  </ButtonWindow>

  {#if communityTabVisible.value}
    <ButtonWindow
      padding="0"
      activeBgColor="rgba(255,255,255,0.12)"
      hoverBgColor="rgba(255,255,255,0.08)"
      isActive={currentTab.value === "communityTab"}
      onButtonClick={onClickCommunity}
    >
      <Community size="16" />
    </ButtonWindow>
  {/if}

  {#if newFileVisible.value}
    <ButtonTool padding="0" onButtonClick={onClickNewProject}>
      <GnomePlus size="16" />
    </ButtonTool>
  {/if}
</div>

<style>
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    -webkit-app-region: no-drag;
  }

  .left :global(div[role="button"]) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
</style>
