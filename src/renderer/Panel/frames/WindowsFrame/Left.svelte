<script lang="ts">
  import { ButtonWindow, ButtonTool } from "Common/Buttons";
  import { Figma, Plus, Community } from "Icons";
  import { newFileVisible, communityTabVisible, currentTab } from "../../store";
  import { onClickHome, onClickNewProject, onClickCommunity } from "../../Components/utils";
</script>

<div class="left">
  <ButtonWindow
    padding="0 10px"
    activeBgColor="rgba(255,255,255,0.15)"
    hoverBgColor="rgba(255,255,255,0.1)"
    isActive={currentTab.value === "mainTab"}
    onButtonClick={onClickHome}
  >
    <Figma size="22" />
  </ButtonWindow>

  {#if communityTabVisible.value}
    <ButtonWindow
      padding="0 10px"
      activeBgColor="rgba(255,255,255,0.15)"
      hoverBgColor="rgba(255,255,255,0.1)"
      isActive={currentTab.value === "communityTab"}
      onButtonClick={onClickCommunity}
    >
      <Community size="20" />
    </ButtonWindow>
  {/if}

  {#if newFileVisible.value}
    <ButtonTool padding="0 10px" onButtonClick={onClickNewProject}>
      <Plus size="15" />
    </ButtonTool>
  {/if}
</div>

<style>
  .left {
    display: flex;
    align-items: center;
    gap: 0px;
    -webkit-app-region: no-drag;
  }

  /* Buttons stretch to full panel height in Windows style */
  .left :global(div[role="button"]) {
    border-radius: 0px;
    width: auto;
    height: 40px;
  }
</style>
