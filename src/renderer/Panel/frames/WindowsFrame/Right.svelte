<script lang="ts">
  import { ButtonWindow } from "Common/Buttons";
  import { Corner, Minimize, Maximize, Close } from "Icons";
  import { tabs, isMenuOpen, windowControls } from "../../store";

  function clickMenu() {
    if (isMenuOpen.value) return;
    window.figmaApi.send("openMainMenu");
    isMenuOpen.toggle();
  }

  function closeHandler() {
    window.figmaApi.send("windowClose", $state.snapshot(tabs.value));
  }
</script>

<div class="controls">
  <ButtonWindow
    padding="0"
    isActive={isMenuOpen.value}
    hoverBgColor="rgba(255,255,255,0.1)"
    activeBgColor="rgba(255,255,255,0.15)"
    onButtonClick={clickMenu}
  >
    <Corner size="14" />
  </ButtonWindow>

  {#if !windowControls.hideMinMax}
    <ButtonWindow
      padding="0"
      hoverBgColor="rgba(255,255,255,0.1)"
      activeBgColor="rgba(255,255,255,0.15)"
      onButtonClick={() => window.figmaApi.send("windowMinimize")}
    >
      <Minimize size="16" />
    </ButtonWindow>

    <ButtonWindow
      padding="0"
      hoverBgColor="rgba(255,255,255,0.1)"
      activeBgColor="rgba(255,255,255,0.15)"
      onButtonClick={() => window.figmaApi.send("windowMaximize")}
    >
      <Maximize size="16" />
    </ButtonWindow>
  {/if}

  <ButtonWindow
    padding="0"
    hoverBgColor="#c42b1c"
    activeBgColor="#a01010"
    onButtonClick={closeHandler}
  >
    <Close size="16" />
  </ButtonWindow>
</div>

<style>
  .controls {
    display: flex;
    align-items: stretch;
    gap: 0px;
    -webkit-app-region: no-drag;
  }

  .controls :global(div[role="button"]) {
    width: 40px;
    height: 40px;
    border-radius: 0px;
  }
</style>
